import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { acordosFinanceiros, profissionais, regrasRecorrencia, salas, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { descreverCondicoes, gradeHorariosSchema, type DadosMinutaPadrao, type ItemGrade } from "../domain/contratos";
import { ROTULOS_MODELO } from "../domain/financeiro";
import { exigirPermissao, pode } from "../domain/rbac";
import { dataValida, hojeNoFuso, somarDias, type DataLocal } from "../domain/tempo";
import { ErroNegocio } from "./erros";
import { acordoSchema, inserirVersaoDoContrato } from "./financeiro";
import { profissionalDoUsuario } from "./profissionais";
import { encerrarRegraNaTransacao, materializarRecorrencias } from "./reservas";

// Contrato do profissional: uma versão do acordo financeiro (preço, regras de falta e de
// cancelamento, termos) + grade fixa opcional, que gera as reservas e entra na cobrança.
// Reajuste = nova versão; a anterior se encerra na véspera, e a grade passa junto.

export const gradeContratoSchema = z.object({ salaId: z.uuid("Escolha a sala da grade fixa"), itens: gradeHorariosSchema });
export type GradeContrato = z.input<typeof gradeContratoSchema>;

export type SituacaoContrato = "vigente" | "futuro" | "encerrado";

function situacao(c: { vigenteDe: DataLocal; vigenteAte: DataLocal | null }, hoje: DataLocal): SituacaoContrato {
  if (c.vigenteDe > hoje) return "futuro";
  if (c.vigenteAte !== null && c.vigenteAte < hoje) return "encerrado";
  return "vigente";
}

/** Profissional só enxerga os próprios contratos; admin e recepção, todos. */
async function filtroDeAcesso(tx: Transaction, ctx: ContextoTenant): Promise<string | null> {
  if (pode(ctx.role, "contratos.gerenciar") || ctx.role === "recepcao") return null;
  const proprio = await profissionalDoUsuario(tx, ctx.userId);
  if (!proprio) throw new ErroNegocio("Seu acesso não está vinculado a um profissional");
  return proprio.id;
}

async function gradeDoContrato(tx: Transaction, acordoId: string) {
  return tx
    .select({
      id: regrasRecorrencia.id,
      salaId: regrasRecorrencia.salaId,
      salaNome: salas.nome,
      unidadeNome: unidades.nome,
      timezone: unidades.timezone,
      diaSemana: regrasRecorrencia.diaSemana,
      horaInicio: regrasRecorrencia.horaInicio,
      horaFim: regrasRecorrencia.horaFim,
    })
    .from(regrasRecorrencia)
    .innerJoin(salas, eq(salas.id, regrasRecorrencia.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(and(eq(regrasRecorrencia.acordoId, acordoId), isNull(regrasRecorrencia.encerradaEm)))
    .orderBy(asc(regrasRecorrencia.diaSemana), asc(regrasRecorrencia.horaInicio));
}

const hora = (t: string) => t.slice(0, 5);

/**
 * Cria uma versão do contrato. `grade`: omitida mantém a grade da versão anterior (reajuste);
 * `null` remove a grade; um objeto troca a grade (as datas futuras sem pacientes são liberadas e as
 * novas são reservadas). Devolve as datas em que a sala já estava ocupada.
 */
export async function criarContrato(
  ctx: ContextoTenant,
  dados: z.input<typeof acordoSchema>,
  opcoes: { grade?: GradeContrato | null; agora?: Date } = {},
  database?: Database,
): Promise<{ id: string; codigo: string; reservasCriadas: number; datasEmConflito: string[] }> {
  exigirPermissao(ctx.role, "contratos.gerenciar");
  const agora = opcoes.agora ?? new Date();
  const grade = opcoes.grade ? gradeContratoSchema.parse(opcoes.grade) : opcoes.grade;
  const a = acordoSchema.parse({ ...dados, salaId: dados.salaId ?? (grade ? grade.salaId : null) });
  return withTenant(
    ctx,
    async (tx) => {
      const contrato = await inserirVersaoDoContrato(tx, a);
      if (grade !== undefined) {
        for (const regra of await tx
          .select()
          .from(regrasRecorrencia)
          .where(and(eq(regrasRecorrencia.acordoId, contrato.id), isNull(regrasRecorrencia.encerradaEm)))) {
          await encerrarRegraNaTransacao(tx, regra, a.vigenteDe, agora, "espaco");
        }
      }
      let reservasCriadas = 0;
      let datasEmConflito: string[] = [];
      if (grade) {
        const [sala] = await tx
          .select({ timezone: unidades.timezone })
          .from(salas)
          .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
          .where(and(eq(salas.id, grade.salaId), eq(salas.ativo, true)));
        if (!sala) throw new ErroNegocio("Sala não encontrada ou inativa");
        const hoje = hojeNoFuso(sala.timezone, agora);
        const inicio = a.vigenteDe > hoje ? a.vigenteDe : hoje;
        if (a.vigenteAte && a.vigenteAte < inicio) throw new ErroNegocio("A grade fixa precisa de dias de vigência a partir de hoje");
        for (const item of grade.itens) {
          await tx.insert(regrasRecorrencia).values({
            acordoId: contrato.id,
            salaId: grade.salaId,
            profissionalId: a.profissionalId,
            diaSemana: item.diaSemana,
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
            dataInicio: inicio,
            dataFim: a.vigenteAte,
          });
        }
        const r = await materializarRecorrencias(tx, agora, { acordoId: contrato.id });
        reservasCriadas = r.criadas;
        datasEmConflito = r.datasConflito ?? [];
      }
      await registrarAuditoria(tx, {
        acao: "contrato.grade",
        entidade: "acordos_financeiros",
        entidadeId: contrato.id,
        dados: { grade: grade === undefined ? "mantida" : grade === null ? "removida" : grade.itens.length, reservasCriadas, conflitos: datasEmConflito.length },
      });
      return { id: contrato.id, codigo: contrato.codigo, reservasCriadas, datasEmConflito };
    },
    database,
  );
}

export async function listarContratos(
  ctx: ContextoTenant,
  filtro: { profissionalId?: string } = {},
  agora = new Date(),
  database?: Database,
) {
  exigirPermissao(ctx.role, "contratos.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const somente = (await filtroDeAcesso(tx, ctx)) ?? filtro.profissionalId ?? null;
      const linhas = await tx
        .select({ contrato: acordosFinanceiros, profissionalNome: profissionais.nome, salaNome: salas.nome })
        .from(acordosFinanceiros)
        .innerJoin(profissionais, eq(profissionais.id, acordosFinanceiros.profissionalId))
        .leftJoin(salas, eq(salas.id, acordosFinanceiros.salaId))
        .where(somente ? eq(acordosFinanceiros.profissionalId, somente) : undefined)
        .orderBy(asc(profissionais.nome), desc(acordosFinanceiros.vigenteDe));
      const hoje = hojeNoFuso("America/Sao_Paulo", agora);
      return linhas.map(({ contrato, profissionalNome, salaNome }) => ({
        id: contrato.id,
        codigo: contrato.codigo,
        profissionalId: contrato.profissionalId,
        profissionalNome,
        salaNome,
        modelo: ROTULOS_MODELO[contrato.modelo],
        resumo: descreverCondicoes(contrato)[0] ?? "",
        vigenteDe: contrato.vigenteDe,
        vigenteAte: contrato.vigenteAte,
        situacao: situacao(contrato, hoje),
      }));
    },
    database,
  );
}

export async function obterContrato(ctx: ContextoTenant, contratoId: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "contratos.ver");
  const id = z.uuid().parse(contratoId);
  return withTenant(
    ctx,
    async (tx) => {
      const [linha] = await tx
        .select({ contrato: acordosFinanceiros, profissional: profissionais })
        .from(acordosFinanceiros)
        .innerJoin(profissionais, eq(profissionais.id, acordosFinanceiros.profissionalId))
        .where(eq(acordosFinanceiros.id, id));
      if (!linha) throw new ErroNegocio("Contrato não encontrado");
      const somente = await filtroDeAcesso(tx, ctx);
      if (somente && somente !== linha.contrato.profissionalId) throw new ErroNegocio("Você só pode ver os seus contratos");
      const grade = await gradeDoContrato(tx, id);
      const versoes = await tx
        .select({ id: acordosFinanceiros.id, codigo: acordosFinanceiros.codigo, vigenteDe: acordosFinanceiros.vigenteDe, vigenteAte: acordosFinanceiros.vigenteAte })
        .from(acordosFinanceiros)
        .where(eq(acordosFinanceiros.profissionalId, linha.contrato.profissionalId))
        .orderBy(desc(acordosFinanceiros.vigenteDe));
      const hoje = hojeNoFuso("America/Sao_Paulo", agora);
      return {
        contrato: linha.contrato,
        profissional: { id: linha.profissional.id, nome: linha.profissional.nome, conselho: linha.profissional.conselho, registro: linha.profissional.registro },
        situacao: situacao(linha.contrato, hoje),
        condicoes: descreverCondicoes(linha.contrato),
        grade: grade.map((g) => ({ ...g, horaInicio: hora(g.horaInicio), horaFim: hora(g.horaFim) })),
        versoes: versoes.map((v) => ({ ...v, situacao: situacao(v, hoje) })),
      };
    },
    database,
  );
}

/** Encerra o contrato no dia `ultimoDia` (inclusive): a grade fixa termina junto. */
export async function encerrarContrato(
  ctx: ContextoTenant,
  contratoId: string,
  ultimoDia: string,
  agora = new Date(),
  database?: Database,
) {
  exigirPermissao(ctx.role, "contratos.gerenciar");
  const id = z.uuid().parse(contratoId);
  if (!dataValida(ultimoDia)) throw new ErroNegocio("Data inválida");
  return withTenant(
    ctx,
    async (tx) => {
      const [c] = await tx.select().from(acordosFinanceiros).where(eq(acordosFinanceiros.id, id)).for("update");
      if (!c) throw new ErroNegocio("Contrato não encontrado");
      if (ultimoDia < c.vigenteDe) throw new ErroNegocio("O último dia não pode ser antes do início do contrato");
      if (c.vigenteAte !== null && c.vigenteAte <= ultimoDia) throw new ErroNegocio("Este contrato já termina nessa data ou antes");
      await tx.update(acordosFinanceiros).set({ vigenteAte: ultimoDia }).where(eq(acordosFinanceiros.id, id));
      let liberadas = 0;
      let mantidas = 0;
      for (const regra of await tx
        .select()
        .from(regrasRecorrencia)
        .where(and(eq(regrasRecorrencia.acordoId, id), isNull(regrasRecorrencia.encerradaEm)))) {
        const r = await encerrarRegraNaTransacao(tx, regra, somarDias(ultimoDia, 1), agora, "espaco");
        liberadas += r.canceladas;
        mantidas += r.mantidas;
      }
      await registrarAuditoria(tx, {
        acao: "contrato.encerrado",
        entidade: "acordos_financeiros",
        entidadeId: id,
        dados: { ultimoDia, reservasLiberadas: liberadas, reservasComPacientes: mantidas },
      });
      return { reservasLiberadas: liberadas, reservasComPacientes: mantidas };
    },
    database,
  );
}

/** Dados da minuta (impressão / PDF) do contrato. */
export async function dadosDaMinuta(ctx: ContextoTenant, contratoId: string, database?: Database): Promise<DadosMinutaPadrao> {
  const detalhe = await obterContrato(ctx, contratoId, new Date(), database);
  const [espaco] = await withTenant(ctx, (tx) => tx.select({ nome: tenants.nome, documento: tenants.documento }).from(tenants), database);
  const itens: ItemGrade[] = detalhe.grade.map((g) => ({ diaSemana: g.diaSemana, horaInicio: g.horaInicio, horaFim: g.horaFim }));
  return {
    clinicaNome: espaco?.nome ?? "",
    clinicaDocumento: espaco?.documento ?? null,
    profissionalNome: detalhe.profissional.nome,
    profissionalConselho: detalhe.profissional.conselho,
    profissionalRegistro: detalhe.profissional.registro,
    codigo: detalhe.contrato.codigo,
    salaNome: detalhe.grade[0]?.salaNome ?? null,
    condicoes: detalhe.condicoes,
    dataInicio: detalhe.contrato.vigenteDe,
    dataFim: detalhe.contrato.vigenteAte,
    gradeHorarios: itens,
  };
}
