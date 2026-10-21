import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { agendamentos, acordosFinanceiros, contratosLocacao, pacientes, profissionais, regrasRecorrencia, reservasSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao, pode } from "../domain/rbac";
import { datasDaRecorrencia, limiteDaJanela } from "../domain/recorrencia";
import { calcularHorariosVagos, ErroReserva, validarJanela, type ConfigUnidade, type HorarioVago, type JanelaLocal } from "../domain/reservas";
import {
  dataValida,
  diaSemana,
  hojeNoFuso,
  horaValida,
  instanteLocal,
  partesLocais,
  somarDias,
  type DataLocal,
} from "../domain/tempo";
import { gerarLancamentosReserva } from "./financeiro";
import { cancelarNotificacoesDaReserva } from "./outbox";
import { profissionalDoUsuario } from "./profissionais";
import { carregarConfigUnidade } from "./unidades";

const horaSchema = z.string().refine((v) => horaValida(v) || v === "24:00", "Horário inválido");
const dataSchema = z.string().refine(dataValida, "Data inválida");

export const reservaSchema = z.object({
  salaId: z.uuid("Escolha a sala"),
  profissionalId: z.uuid().optional(),
  data: dataSchema,
  horaInicio: horaSchema,
  horaFim: horaSchema,
});

export const recorrenciaSchema = z
  .object({
    salaId: z.uuid("Escolha a sala"),
    profissionalId: z.uuid().optional(),
    dataInicio: dataSchema,
    dataFim: dataSchema.nullable().default(null),
    horaInicio: horaSchema,
    horaFim: horaSchema,
  })
  .refine((r) => !r.dataFim || r.dataFim >= r.dataInicio, "A data final deve ser depois da inicial");

// Agendamentos que ainda ocupam a reserva (agendado, confirmado, presente).
const SEM_AGENDAMENTOS_ATIVOS = sql`select 1 from ${agendamentos}
  where ${agendamentos.reservaId} = ${reservasSala.id}
    and ${agendamentos.status} in ('agendado', 'confirmado', 'presente')`;

function sqlRange(inicio: Date, fim: Date) {
  return sql`tstzrange(${inicio.toISOString()}::timestamptz, ${fim.toISOString()}::timestamptz, '[)')`;
}

export function traduzirConflito(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.violacaoExclusao) {
    if (pg.constraint === "reservas_sala_sem_sobreposicao_profissional") {
      throw new ErroReserva("conflito_profissional", "O profissional já tem outra reserva nesse horário");
    }
    throw new ErroReserva("conflito_sala", "A sala já está reservada nesse horário");
  }
  if (pg?.code === PG.excecaoPlpgsql && pg.message === "reserva.com_agendamentos") {
    throw new ErroReserva("nao_permitido", "Há pacientes agendados nesta reserva: cancele ou remarque os agendamentos antes");
  }
  throw erro;
}

export type SalaComUnidade = { id: string; nome: string; ativo: boolean; unidadeId: string; config: ConfigUnidade };

export async function carregarSala(tx: Transaction, salaId: string): Promise<SalaComUnidade> {
  const [sala] = await tx
    .select({ id: salas.id, nome: salas.nome, ativo: salas.ativo, unidadeId: salas.unidadeId, unidadeAtiva: unidades.ativo })
    .from(salas)
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(eq(salas.id, salaId));
  if (!sala) throw new ErroReserva("nao_encontrada", "Sala não encontrada");
  if (!sala.ativo || !sala.unidadeAtiva) throw new ErroReserva("sala_inativa", "Esta sala não está disponível para reservas");
  const config = await carregarConfigUnidade(tx, sala.unidadeId);
  return { ...sala, config: config! };
}

/**
 * Define de quem é a reserva: profissional reserva só para si; admin/recepção
 * informam o profissional.
 */
export async function resolverProfissional(
  tx: Transaction,
  ctx: ContextoTenant,
  profissionalId: string | undefined,
): Promise<string> {
  if (ctx.role === "profissional") {
    exigirPermissao(ctx.role, "reservas.proprias");
    const proprio = await profissionalDoUsuario(tx, ctx.userId);
    if (!proprio) throw new ErroReserva("nao_permitido", "Seu usuário não está vinculado a um cadastro de profissional");
    if (!proprio.ativo) throw new ErroReserva("profissional_inativo", "Seu cadastro de profissional está inativo");
    return proprio.id;
  }
  exigirPermissao(ctx.role, "reservas.gerenciar");
  if (!profissionalId) throw new ErroReserva("dados_invalidos", "Escolha o profissional");
  const [profissional] = await tx
    .select({ id: profissionais.id, ativo: profissionais.ativo })
    .from(profissionais)
    .where(eq(profissionais.id, profissionalId));
  if (!profissional) throw new ErroReserva("nao_encontrada", "Profissional não encontrado");
  if (!profissional.ativo) throw new ErroReserva("profissional_inativo", "Este profissional está inativo");
  return profissional.id;
}

// ---------------------------------------------------------------------------
// Reserva avulsa
// ---------------------------------------------------------------------------

export async function criarReserva(
  ctx: ContextoTenant,
  dados: z.input<typeof reservaSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string }> {
  const pedido = reservaSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await resolverProfissional(tx, ctx, pedido.profissionalId);
      const sala = await carregarSala(tx, pedido.salaId);
      const periodo = validarJanela(pedido, sala.config, agora);

      const [reserva] = await tx
        .insert(reservasSala)
        .values({ salaId: sala.id, profissionalId, periodo })
        .returning({ id: reservasSala.id })
        .catch(traduzirConflito);
      await registrarAuditoria(tx, {
        acao: "reserva.criada",
        entidade: "reservas_sala",
        entidadeId: reserva.id,
        dados: { salaId: sala.id, profissionalId, data: pedido.data, horaInicio: pedido.horaInicio, horaFim: pedido.horaFim },
      });
      return reserva;
    },
    database,
  );
}

export async function cancelarReserva(
  ctx: ContextoTenant,
  reservaId: string,
  motivo: string | null,
  agora = new Date(),
  database?: Database,
): Promise<void> {
  await withTenant(
    ctx,
    async (tx) => {
      const [reserva] = await tx.select().from(reservasSala).where(eq(reservasSala.id, reservaId)).for("update");
      if (!reserva) throw new ErroReserva("nao_encontrada", "Reserva não encontrada");
      if (reserva.status !== "ativa") throw new ErroReserva("nao_permitido", "Esta reserva não está ativa");

      if (pode(ctx.role, "reservas.gerenciar")) {
        if (reserva.periodo.fim.getTime() <= agora.getTime()) {
          throw new ErroReserva("nao_permitido", "Não é possível cancelar uma reserva que já terminou");
        }
      } else {
        exigirPermissao(ctx.role, "reservas.proprias");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== reserva.profissionalId) {
          throw new ErroReserva("nao_permitido", "Você só pode cancelar as suas reservas");
        }
        if (reserva.periodo.inicio.getTime() <= agora.getTime()) {
          throw new ErroReserva("nao_permitido", "Não é possível cancelar uma reserva que já começou");
        }
      }

      await tx
        .update(reservasSala)
        .set({ status: "cancelada", canceladaEm: agora, motivoCancelamento: motivo?.trim() || null })
        .where(eq(reservasSala.id, reservaId))
        .catch(traduzirConflito);
      await cancelarNotificacoesDaReserva(tx, reservaId, "Reserva cancelada");
      await registrarAuditoria(tx, {
        acao: "reserva.cancelada",
        entidade: "reservas_sala",
        entidadeId: reservaId,
        dados: { motivo: motivo?.trim() || null },
      });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------

type ResultadoOcorrencia = "criada" | "conflito" | "ignorada";

/** Insere a ocorrência num savepoint: um conflito não aborta a transação externa. */
async function inserirOcorrencia(
  tx: Transaction,
  regra: { id: string; salaId: string; profissionalId: string },
  data: DataLocal,
  periodo: { inicio: Date; fim: Date },
): Promise<ResultadoOcorrencia> {
  try {
    const inseridas = await tx.transaction((sp) =>
      sp
        .insert(reservasSala)
        .values({
          salaId: regra.salaId,
          profissionalId: regra.profissionalId,
          periodo,
          recorrenciaId: regra.id,
          dataOcorrencia: data,
        })
        .onConflictDoNothing({ target: [reservasSala.recorrenciaId, reservasSala.dataOcorrencia] })
        .returning({ id: reservasSala.id }),
    );
    return inseridas.length > 0 ? "criada" : "ignorada";
  } catch (erro) {
    if (erroPostgres(erro)?.code === PG.violacaoExclusao) {
      // Se já existe uma reserva ativa na MESMA sala para o MESMO profissional no mesmo intervalo,
      // atualizamos a reserva vinculando-a à regra do contrato em vez de considerar conflito.
      const existentes = await tx
        .select({ id: reservasSala.id })
        .from(reservasSala)
        .where(
          and(
            eq(reservasSala.salaId, regra.salaId),
            eq(reservasSala.profissionalId, regra.profissionalId),
            eq(reservasSala.status, "ativa"),
            sql`${reservasSala.periodo} && ${sqlRange(periodo.inicio, periodo.fim)}`,
          ),
        )
        .limit(1);

      if (existentes.length > 0) {
        await tx
          .update(reservasSala)
          .set({ recorrenciaId: regra.id, dataOcorrencia: data })
          .where(eq(reservasSala.id, existentes[0].id));
        return "criada";
      }

      return "conflito";
    }
    throw erro;
  }
}

/** Janela da ocorrência; null quando a data deve ser pulada (feriado ou horário já passado). */
function janelaDaOcorrencia(
  janela: JanelaLocal,
  config: ConfigUnidade,
  agora: Date,
): { inicio: Date; fim: Date } | null {
  try {
    return validarJanela(janela, config, agora);
  } catch (erro) {
    if (erro instanceof ErroReserva && (erro.codigo === "feriado" || erro.codigo === "no_passado")) return null;
    throw erro;
  }
}

/**
 * Cria a regra semanal e materializa as ocorrências da janela (8 semanas).
 * Se qualquer ocorrência da janela conflitar, nada é gravado e as datas são informadas.
 */
export async function criarRecorrencia(
  ctx: ContextoTenant,
  dados: z.input<typeof recorrenciaSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string; ocorrencias: number }> {
  const pedido = recorrenciaSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await resolverProfissional(tx, ctx, pedido.profissionalId);
      const sala = await carregarSala(tx, pedido.salaId);
      const hoje = hojeNoFuso(sala.config.timezone, agora);
      if (pedido.dataInicio < hoje) throw new ErroReserva("no_passado", "A recorrência não pode começar no passado");

      const regraSemanal = { diaSemana: diaSemana(pedido.dataInicio), dataInicio: pedido.dataInicio, dataFim: pedido.dataFim };
      const limite = limiteDaJanela(hoje);
      const datas = datasDaRecorrencia(regraSemanal, hoje, limite);
      // Valida o horário (slot, funcionamento) antes de gravar qualquer coisa.
      const janelas = datas.map((data) => ({
        data,
        periodo: janelaDaOcorrencia({ data, horaInicio: pedido.horaInicio, horaFim: pedido.horaFim }, sala.config, agora),
      }));

      const [regra] = await tx
        .insert(regrasRecorrencia)
        .values({
          salaId: sala.id,
          profissionalId,
          diaSemana: regraSemanal.diaSemana,
          horaInicio: pedido.horaInicio,
          horaFim: pedido.horaFim,
          dataInicio: pedido.dataInicio,
          dataFim: pedido.dataFim,
          materializadaAte: limite,
        })
        .returning({ id: regrasRecorrencia.id });

      const conflitos: DataLocal[] = [];
      let ocorrencias = 0;
      for (const { data, periodo } of janelas) {
        if (!periodo) continue;
        const resultado = await inserirOcorrencia(tx, { id: regra.id, salaId: sala.id, profissionalId }, data, periodo);
        if (resultado === "conflito") conflitos.push(data);
        if (resultado === "criada") ocorrencias++;
      }
      if (conflitos.length > 0) {
        throw new ErroReserva(
          "conflito_recorrencia",
          `Há conflito de horário em: ${conflitos.map(formatarDataBr).join(", ")}`,
          { datas: conflitos },
        );
      }

      await registrarAuditoria(tx, {
        acao: "recorrencia.criada",
        entidade: "regras_recorrencia",
        entidadeId: regra.id,
        dados: { ...pedido, profissionalId, ocorrencias },
      });
      return { id: regra.id, ocorrencias };
    },
    database,
  );
}

/** Encerra a série a partir de `aPartirDe` (inclusive), cancelando as ocorrências futuras. */
export async function encerrarRecorrencia(
  ctx: ContextoTenant,
  regraId: string,
  aPartirDe: DataLocal,
  agora = new Date(),
  database?: Database,
): Promise<{ canceladas: number; mantidas: number }> {
  if (!dataValida(aPartirDe)) throw new ErroReserva("dados_invalidos", "Data inválida");
  return withTenant(
    ctx,
    async (tx) => {
      const [regra] = await tx.select().from(regrasRecorrencia).where(eq(regrasRecorrencia.id, regraId)).for("update");
      if (!regra) throw new ErroReserva("nao_encontrada", "Recorrência não encontrada");
      if (!pode(ctx.role, "reservas.gerenciar")) {
        exigirPermissao(ctx.role, "reservas.proprias");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== regra.profissionalId) {
          throw new ErroReserva("nao_permitido", "Você só pode encerrar as suas recorrências");
        }
      }

      const novoFim = somarDias(aPartirDe, -1);
      await tx
        .update(regrasRecorrencia)
        .set({ dataFim: regra.dataFim && regra.dataFim < novoFim ? regra.dataFim : novoFim, encerradaEm: agora })
        .where(eq(regrasRecorrencia.id, regraId));
      const canceladas = await tx
        .update(reservasSala)
        .set({ status: "cancelada", canceladaEm: agora, motivoCancelamento: "Recorrência encerrada" })
        .where(
          and(
            eq(reservasSala.recorrenciaId, regraId),
            eq(reservasSala.status, "ativa"),
            gte(reservasSala.dataOcorrencia, aPartirDe),
            sql`lower(${reservasSala.periodo}) > ${agora.toISOString()}::timestamptz`,
            sql`not exists (${SEM_AGENDAMENTOS_ATIVOS})`,
          ),
        )
        .returning({ id: reservasSala.id });
      // Ocorrências com pacientes agendados ficam ativas até os agendamentos serem resolvidos.
      const mantidas = await tx
        .select({ id: reservasSala.id })
        .from(reservasSala)
        .where(
          and(
            eq(reservasSala.recorrenciaId, regraId),
            eq(reservasSala.status, "ativa"),
            gte(reservasSala.dataOcorrencia, aPartirDe),
            sql`lower(${reservasSala.periodo}) > ${agora.toISOString()}::timestamptz`,
          ),
        );
      await registrarAuditoria(tx, {
        acao: "recorrencia.encerrada",
        entidade: "regras_recorrencia",
        entidadeId: regraId,
        dados: { aPartirDe, canceladas: canceladas.length, mantidas: mantidas.length },
      });
      return { canceladas: canceladas.length, mantidas: mantidas.length };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Jobs do worker (rodam dentro de withSistema, um tenant por vez)
// ---------------------------------------------------------------------------

/** Estende as recorrências ativas até o fim da janela. Conflitos são pulados e auditados. */
export async function materializarRecorrencias(
  tx: Transaction,
  agora = new Date(),
  opcoes?: { contratoId?: string },
): Promise<{ criadas: number; conflitos: number; datasConflito?: string[] }> {
  const condicoes = [isNull(regrasRecorrencia.encerradaEm)];
  if (opcoes?.contratoId) {
    condicoes.push(eq(regrasRecorrencia.contratoId, opcoes.contratoId));
  }

  const regras = await tx
    .select({
      regra: regrasRecorrencia,
      salaAtiva: salas.ativo,
      unidadeId: salas.unidadeId,
      profissionalAtivo: profissionais.ativo,
    })
    .from(regrasRecorrencia)
    .innerJoin(salas, eq(salas.id, regrasRecorrencia.salaId))
    .innerJoin(profissionais, eq(profissionais.id, regrasRecorrencia.profissionalId))
    .where(and(...condicoes));

  const configs = new Map<string, ConfigUnidade | null>();
  let criadas = 0;
  let conflitos = 0;
  const datasConflito: string[] = [];

  for (const { regra, salaAtiva, unidadeId, profissionalAtivo } of regras) {
    if (!salaAtiva || !profissionalAtivo) continue;
    if (!configs.has(unidadeId)) configs.set(unidadeId, await carregarConfigUnidade(tx, unidadeId));
    const config = configs.get(unidadeId);
    if (!config) continue;

    const hoje = hojeNoFuso(config.timezone, agora);
    const limite = limiteDaJanela(hoje);
    if (regra.materializadaAte && regra.materializadaAte >= limite) continue;
    const de = regra.materializadaAte && regra.materializadaAte >= hoje ? somarDias(regra.materializadaAte, 1) : hoje;

    for (const data of datasDaRecorrencia(regra, de, limite)) {
      let periodo: { inicio: Date; fim: Date } | null;
      try {
        periodo = janelaDaOcorrencia({ data, horaInicio: regra.horaInicio, horaFim: regra.horaFim }, config, agora);
      } catch (erro) {
        // Horário de funcionamento mudou depois da criação da regra: pula a data.
        if (erro instanceof ErroReserva) periodo = null;
        else throw erro;
      }
      if (!periodo) continue;
      const resultado = await inserirOcorrencia(tx, regra, data, periodo);
      if (resultado === "criada") criadas++;
      if (resultado === "conflito") {
        conflitos++;
        datasConflito.push(`${data} ${regra.horaInicio}-${regra.horaFim}`);
        await registrarAuditoria(tx, {
          acao: "recorrencia.conflito",
          entidade: "regras_recorrencia",
          entidadeId: regra.id,
          dados: { data },
        });
      }
    }
    await tx.update(regrasRecorrencia).set({ materializadaAte: limite }).where(eq(regrasRecorrencia.id, regra.id));
  }
  return opcoes?.contratoId ? { criadas, conflitos, datasConflito } : { criadas, conflitos };
}

/** Marca como concluídas as reservas ativas que já terminaram e gera a locação por hora. */
export async function concluirReservasPassadas(tx: Transaction, agora = new Date()): Promise<number> {
  const concluidas = await tx
    .update(reservasSala)
    .set({ status: "concluida" })
    .where(and(eq(reservasSala.status, "ativa"), sql`upper(${reservasSala.periodo}) <= ${agora.toISOString()}::timestamptz`))
    .returning({ id: reservasSala.id });
  for (const r of concluidas) await gerarLancamentosReserva(tx, r.id);
  return concluidas.length;
}

// ---------------------------------------------------------------------------
// Leitura da agenda
// ---------------------------------------------------------------------------

export type AtendimentoNaReserva = {
  id: string;
  pacienteNome: string;
  horaInicio: string;
  horaFim: string;
  status: string;
};

export type ReservaNaAgenda = {
  id: string;
  salaId: string;
  data: DataLocal;
  horaInicio: string;
  horaFim: string;
  status: "ativa" | "concluida" | "cancelada";
  /** null quando o usuário (profissional) não pode ver de quem é a reserva. */
  profissionalNome: string | null;
  propria: boolean;
  recorrenciaId: string | null;
  ehSalaFixa: boolean;
  contratoCodigo: string | null;
  contratoId: string | null;
  /** Pacientes com agendamento ativo/realizado na reserva (só para quem vê a reserva). */
  pacientes: number;
  pacientesNomes: string[];
  atendimentos: AtendimentoNaReserva[];
};

/** Reservas não canceladas das salas no período; para profissionais, as de terceiros vêm anônimas. */
async function reservasNoPeriodo(
  tx: Transaction,
  ctx: ContextoTenant,
  salaIds: string[],
  inicio: Date,
  fim: Date,
  timezone: string,
): Promise<ReservaNaAgenda[]> {
  if (salaIds.length === 0) return [];
  const proprio = ctx.role === "profissional" ? await profissionalDoUsuario(tx, ctx.userId) : null;
  const linhas = await tx
    .select({
      id: reservasSala.id,
      salaId: reservasSala.salaId,
      periodo: reservasSala.periodo,
      status: reservasSala.status,
      profissionalId: reservasSala.profissionalId,
      profissionalNome: profissionais.nome,
      recorrenciaId: reservasSala.recorrenciaId,
      ehSalaFixa: sql<boolean>`exists (
        select 1 from ${acordosFinanceiros}
        where ${acordosFinanceiros.profissionalId} = ${reservasSala.profissionalId}
          and ${acordosFinanceiros.salaId} = ${reservasSala.salaId}
          and ${acordosFinanceiros.modelo} = 'sala_fixa'
      ) or exists (
        select 1 from ${regrasRecorrencia}
        where ${regrasRecorrencia.id} = ${reservasSala.recorrenciaId}
          and ${regrasRecorrencia.contratoId} is not null
      )`,
      contratoCodigo: sql<string | null>`(
        select ${contratosLocacao.codigo} from ${regrasRecorrencia}
        inner join ${contratosLocacao} on ${contratosLocacao.id} = ${regrasRecorrencia.contratoId}
        where ${regrasRecorrencia.id} = ${reservasSala.recorrenciaId}
        limit 1
      )`,
      contratoId: sql<string | null>`(
        select ${regrasRecorrencia.contratoId} from ${regrasRecorrencia}
        where ${regrasRecorrencia.id} = ${reservasSala.recorrenciaId}
        limit 1
      )`,
      pacientes: sql<number>`(select count(*)::int from ${agendamentos}
        where ${agendamentos.reservaId} = ${reservasSala.id} and ${agendamentos.status} <> 'cancelado')`,
    })
    .from(reservasSala)
    .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
    .where(
      and(
        inArray(reservasSala.salaId, salaIds),
        or(eq(reservasSala.status, "ativa"), eq(reservasSala.status, "concluida")),
        sql`${reservasSala.periodo} && ${sqlRange(inicio, fim)}`,
      ),
    )
    .orderBy(asc(reservasSala.periodo));

  const veTudo = pode(ctx.role, "reservas.gerenciar");

  const resIds = linhas.map((r) => r.id);
  const atendimentos = resIds.length > 0
    ? await tx
        .select({
          id: agendamentos.id,
          reservaId: agendamentos.reservaId,
          pacienteNome: pacientes.nome,
          periodo: agendamentos.periodo,
          status: agendamentos.status,
        })
        .from(agendamentos)
        .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
        .where(
          and(
            inArray(agendamentos.reservaId, resIds),
            ne(agendamentos.status, "cancelado"),
          ),
        )
        .orderBy(asc(agendamentos.periodo))
    : [];

  const atendimentosPorReserva = new Map<string, AtendimentoNaReserva[]>();
  const pacientesPorReserva = new Map<string, string[]>();
  for (const a of atendimentos) {
    const aIni = partesLocais(a.periodo.inicio, timezone);
    const aFim = partesLocais(a.periodo.fim, timezone);
    const horaIni = aIni.hora;
    const horaFim = aFim.data === aIni.data ? aFim.hora : "24:00";

    const atList = atendimentosPorReserva.get(a.reservaId) ?? [];
    atList.push({
      id: a.id,
      pacienteNome: a.pacienteNome,
      horaInicio: horaIni,
      horaFim,
      status: a.status,
    });
    atendimentosPorReserva.set(a.reservaId, atList);

    const lista = pacientesPorReserva.get(a.reservaId) ?? [];
    if (!lista.includes(a.pacienteNome)) lista.push(a.pacienteNome);
    pacientesPorReserva.set(a.reservaId, lista);
  }

  return linhas.map((r) => {
    const ini = partesLocais(r.periodo.inicio, timezone);
    const fimLocal = partesLocais(r.periodo.fim, timezone);
    const propria = proprio?.id === r.profissionalId;
    const podeVerDetalhes = veTudo || propria;
    const nomes = podeVerDetalhes ? (pacientesPorReserva.get(r.id) ?? []) : [];
    const ats = podeVerDetalhes ? (atendimentosPorReserva.get(r.id) ?? []) : [];
    return {
      id: r.id,
      salaId: r.salaId,
      data: ini.data,
      horaInicio: ini.hora,
      horaFim: fimLocal.data === ini.data ? fimLocal.hora : "24:00",
      status: r.status,
      profissionalNome: podeVerDetalhes ? r.profissionalNome : null,
      propria,
      recorrenciaId: podeVerDetalhes ? r.recorrenciaId : null,
      ehSalaFixa: Boolean(r.ehSalaFixa),
      contratoCodigo: podeVerDetalhes ? r.contratoCodigo : null,
      contratoId: podeVerDetalhes ? r.contratoId : null,
      pacientes: podeVerDetalhes ? r.pacientes : 0,
      pacientesNomes: nomes,
      atendimentos: ats,
    };
  });
}

export async function listarAgenda(
  ctx: ContextoTenant,
  filtro: { unidadeId: string; de: DataLocal; dias: number; salaId?: string },
  database?: Database,
) {
  exigirPermissao(ctx.role, "agenda.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const config = await carregarConfigUnidade(tx, filtro.unidadeId);
      if (!config) return null;
      const salasDaUnidade = await tx
        .select({ id: salas.id, nome: salas.nome })
        .from(salas)
        .where(
          and(
            eq(salas.unidadeId, filtro.unidadeId),
            eq(salas.ativo, true),
            filtro.salaId ? eq(salas.id, filtro.salaId) : undefined,
          ),
        )
        .orderBy(asc(salas.nome));
      const inicio = instanteLocal(filtro.de, "00:00", config.timezone);
      const fim = instanteLocal(somarDias(filtro.de, filtro.dias), "00:00", config.timezone);
      const reservas = await reservasNoPeriodo(tx, ctx, salasDaUnidade.map((s) => s.id), inicio, fim, config.timezone);
      return { config, salas: salasDaUnidade, reservas };
    },
    database,
  );
}

export async function obterReserva(ctx: ContextoTenant, reservaId: string, database?: Database) {
  exigirPermissao(ctx.role, "agenda.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const [linha] = await tx
        .select({
          reserva: reservasSala,
          salaNome: salas.nome,
          timezone: unidades.timezone,
          profissionalNome: profissionais.nome,
        })
        .from(reservasSala)
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
        .where(eq(reservasSala.id, reservaId));
      if (!linha) return null;
      const proprio = ctx.role === "profissional" ? await profissionalDoUsuario(tx, ctx.userId) : null;
      const propria = proprio?.id === linha.reserva.profissionalId;
      // Profissional não vê detalhes da reserva de outro.
      if (!pode(ctx.role, "reservas.gerenciar") && !propria) return null;
      const ini = partesLocais(linha.reserva.periodo.inicio, linha.timezone);
      const fim = partesLocais(linha.reserva.periodo.fim, linha.timezone);

      const [acordoSalaFixa] = await tx
        .select({ id: acordosFinanceiros.id })
        .from(acordosFinanceiros)
        .where(
          and(
            eq(acordosFinanceiros.profissionalId, linha.reserva.profissionalId),
            eq(acordosFinanceiros.salaId, linha.reserva.salaId),
            eq(acordosFinanceiros.modelo, "sala_fixa"),
          ),
        )
        .limit(1);

      const [vinculoContrato] = linha.reserva.recorrenciaId
        ? await tx
            .select({
              contratoId: regrasRecorrencia.contratoId,
              codigo: contratosLocacao.codigo,
            })
            .from(regrasRecorrencia)
            .innerJoin(contratosLocacao, eq(contratosLocacao.id, regrasRecorrencia.contratoId))
            .where(eq(regrasRecorrencia.id, linha.reserva.recorrenciaId))
            .limit(1)
        : [];

      const agsAtivos = await tx
        .select({
          id: agendamentos.id,
          periodo: agendamentos.periodo,
        })
        .from(agendamentos)
        .where(
          and(
            eq(agendamentos.reservaId, reservaId),
            inArray(agendamentos.status, ["agendado", "confirmado", "presente"]),
          ),
        )
        .orderBy(asc(agendamentos.periodo));

      const ocupados = agsAtivos.map((a) => {
        const aIni = partesLocais(a.periodo.inicio, linha.timezone);
        const aFim = partesLocais(a.periodo.fim, linha.timezone);
        return {
          horaInicio: aIni.hora,
          horaFim: aFim.data === ini.data ? aFim.hora : "24:00",
        };
      });

      const horariosVagos = calcularHorariosVagos(
        { horaInicio: ini.hora, horaFim: fim.hora },
        ocupados,
      );

      return {
        id: linha.reserva.id,
        status: linha.reserva.status,
        salaNome: linha.salaNome,
        profissionalNome: linha.profissionalNome,
        data: ini.data,
        horaInicio: ini.hora,
        horaFim: fim.hora,
        inicio: linha.reserva.periodo.inicio,
        fim: linha.reserva.periodo.fim,
        recorrenciaId: linha.reserva.recorrenciaId,
        dataOcorrencia: linha.reserva.dataOcorrencia,
        propria,
        ehSalaFixa: Boolean(acordoSalaFixa || vinculoContrato),
        contratoId: vinculoContrato?.contratoId ?? null,
        contratoCodigo: vinculoContrato?.codigo ?? null,
        horariosVagos,
      };
    },
    database,
  );
}

/** Próximas reservas ativas do profissional logado. */
export async function minhasProximasReservas(ctx: ContextoTenant, agora = new Date(), limite = 10, database?: Database) {
  exigirPermissao(ctx.role, "reservas.proprias");
  return withTenant(
    ctx,
    async (tx) => {
      const proprio = await profissionalDoUsuario(tx, ctx.userId);
      if (!proprio) return [];
      const linhas = await tx
        .select({ id: reservasSala.id, periodo: reservasSala.periodo, salaNome: salas.nome, unidadeNome: unidades.nome, timezone: unidades.timezone, recorrenciaId: reservasSala.recorrenciaId })
        .from(reservasSala)
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(
          and(
            eq(reservasSala.profissionalId, proprio.id),
            eq(reservasSala.status, "ativa"),
            sql`upper(${reservasSala.periodo}) > ${agora.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(asc(reservasSala.periodo))
        .limit(limite);
      return linhas.map((l) => {
        const ini = partesLocais(l.periodo.inicio, l.timezone);
        return {
          id: l.id,
          salaNome: l.salaNome,
          unidadeNome: l.unidadeNome,
          data: ini.data,
          horaInicio: ini.hora,
          horaFim: partesLocais(l.periodo.fim, l.timezone).hora,
          recorrente: l.recorrenciaId !== null,
        };
      });
    },
    database,
  );
}

/** Profissionais ativos para o seletor de reserva (admin/recepção). */
export async function listarProfissionaisParaReserva(ctx: ContextoTenant, database?: Database) {
  if (!pode(ctx.role, "reservas.gerenciar")) return [];
  return withTenant(
    ctx,
    (tx) =>
      tx
        .select({ id: profissionais.id, nome: profissionais.nome })
        .from(profissionais)
        .where(eq(profissionais.ativo, true))
        .orderBy(asc(profissionais.nome)),
    database,
  );
}

export function formatarDataBr(data: DataLocal): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export type SalaPanorama = {
  id: string;
  nome: string;
  estado: "em_atendimento" | "reservada_vaga" | "livre";
  reserva?: {
    id: string;
    profissionalNome: string;
    horaInicio: string;
    horaFim: string;
    ehSalaFixa: boolean;
  };
  atendimentoAtual?: {
    id: string;
    pacienteNome: string;
    status: "agendado" | "confirmado" | "presente";
    horaInicio: string;
    horaFim: string;
  };
};

export type PanoramaUnidade = {
  salas: SalaPanorama[];
  resumoDia: {
    totalConsultas: number;
    pacientesAguardando: number;
    consultasRealizadas: number;
  };
};

export async function obterPanoramaSalas(
  ctx: ContextoTenant,
  unidadeId: string,
  agora = new Date(),
  database?: Database,
): Promise<PanoramaUnidade | null> {
  exigirPermissao(ctx.role, "agenda.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const config = await carregarConfigUnidade(tx, unidadeId);
      if (!config) return null;

      const salasAtivas = await tx
        .select({ id: salas.id, nome: salas.nome })
        .from(salas)
        .where(and(eq(salas.unidadeId, unidadeId), eq(salas.ativo, true)))
        .orderBy(asc(salas.nome));

      if (salasAtivas.length === 0) {
        return {
          salas: [],
          resumoDia: { totalConsultas: 0, pacientesAguardando: 0, consultasRealizadas: 0 },
        };
      }

      const salaIds = salasAtivas.map((s) => s.id);
      const hoje = hojeNoFuso(config.timezone, agora);
      const inicioDia = instanteLocal(hoje, "00:00", config.timezone);
      const fimDia = instanteLocal(somarDias(hoje, 1), "00:00", config.timezone);

      const reservasAgora = await tx
        .select({
          id: reservasSala.id,
          salaId: reservasSala.salaId,
          periodo: reservasSala.periodo,
          profissionalId: reservasSala.profissionalId,
          profissionalNome: profissionais.nome,
          ehSalaFixa: sql<boolean>`exists (
            select 1 from ${acordosFinanceiros}
            where ${acordosFinanceiros.profissionalId} = ${reservasSala.profissionalId}
              and ${acordosFinanceiros.salaId} = ${reservasSala.salaId}
              and ${acordosFinanceiros.modelo} = 'sala_fixa'
          ) or exists (
            select 1 from ${regrasRecorrencia}
            where ${regrasRecorrencia.id} = ${reservasSala.recorrenciaId}
              and ${regrasRecorrencia.contratoId} is not null
          )`,
        })
        .from(reservasSala)
        .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
        .where(
          and(
            inArray(reservasSala.salaId, salaIds),
            eq(reservasSala.status, "ativa"),
            sql`${reservasSala.periodo} @> ${agora.toISOString()}::timestamptz`,
          ),
        );

      const resIds = reservasAgora.map((r) => r.id);
      const agendamentosAgora = resIds.length > 0
        ? await tx
            .select({
              id: agendamentos.id,
              reservaId: agendamentos.reservaId,
              periodo: agendamentos.periodo,
              status: agendamentos.status,
              pacienteNome: pacientes.nome,
            })
            .from(agendamentos)
            .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
            .where(
              and(
                inArray(agendamentos.reservaId, resIds),
                inArray(agendamentos.status, ["agendado", "confirmado", "presente"]),
                sql`${agendamentos.periodo} @> ${agora.toISOString()}::timestamptz`,
              ),
            )
        : [];

      const atendimentosHoje = await tx
        .select({
          status: agendamentos.status,
        })
        .from(agendamentos)
        .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
        .where(
          and(
            inArray(reservasSala.salaId, salaIds),
            sql`${agendamentos.periodo} && tstzrange(${inicioDia.toISOString()}::timestamptz, ${fimDia.toISOString()}::timestamptz)`,
            ne(agendamentos.status, "cancelado"),
          ),
        );

      const totalConsultas = atendimentosHoje.length;
      const pacientesAguardando = atendimentosHoje.filter((a) => a.status === "presente").length;
      const consultasRealizadas = atendimentosHoje.filter((a) => a.status === "realizado").length;

      const salasMap: SalaPanorama[] = salasAtivas.map((s) => {
        const res = reservasAgora.find((r) => r.salaId === s.id);
        if (!res) {
          return { id: s.id, nome: s.nome, estado: "livre" };
        }
        const ag = agendamentosAgora.find((a) => a.reservaId === res.id);
        const iniRes = partesLocais(res.periodo.inicio, config.timezone);
        const fimRes = partesLocais(res.periodo.fim, config.timezone);

        if (ag) {
          const iniAg = partesLocais(ag.periodo.inicio, config.timezone);
          const fimAg = partesLocais(ag.periodo.fim, config.timezone);
          return {
            id: s.id,
            nome: s.nome,
            estado: "em_atendimento",
            reserva: {
              id: res.id,
              profissionalNome: res.profissionalNome,
              horaInicio: iniRes.hora,
              horaFim: fimRes.hora,
              ehSalaFixa: Boolean(res.ehSalaFixa),
            },
            atendimentoAtual: {
              id: ag.id,
              pacienteNome: ag.pacienteNome,
              status: ag.status as "agendado" | "confirmado" | "presente",
              horaInicio: iniAg.hora,
              horaFim: fimAg.hora,
            },
          };
        }

        return {
          id: s.id,
          nome: s.nome,
          estado: "reservada_vaga",
          reserva: {
            id: res.id,
            profissionalNome: res.profissionalNome,
            horaInicio: iniRes.hora,
            horaFim: fimRes.hora,
            ehSalaFixa: Boolean(res.ehSalaFixa),
          },
        };
      });

      return {
        salas: salasMap,
        resumoDia: { totalConsultas, pacientesAguardando, consultasRealizadas },
      };
    },
    database,
  );
}
