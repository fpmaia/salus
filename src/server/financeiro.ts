import { and, asc, desc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import {
  acordosFinanceiros,
  agendamentos,
  regrasRecorrencia,
  fechamentos,
  lancamentos,
  pagamentos,
  profissionais,
  reservasSala,
  salas,
  tenantSettings,
  unidades,
} from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import {
  acordoVigente,
  competenciaDe,
  conciliar,
  lancamentosDaMensalidade,
  lancamentosDaReserva,
  lancamentosDaReservaCancelada,
  lancamentosDoAgendamento,
  MODELOS,
  proximaCompetencia,
  ultimoDiaDaCompetencia,
  type LancamentoDesejado,
  type Natureza,
  type TipoLancamento,
} from "../domain/financeiro";
import { exigirPermissao, pode } from "../domain/rbac";
import { intervalosDoDia } from "../domain/reservas";
import { dataValida, hojeNoFuso, instanteLocal, partesLocais, somarDias, type DataLocal } from "../domain/tempo";
import { ErroNegocio } from "./erros";
import type { RegraDePreco } from "../domain/contratos";
import { profissionalDoUsuario } from "./profissionais";
import { carregarConfigUnidade } from "./unidades";

// ---------------------------------------------------------------------------
// Contratos (acordos financeiros versionados)
// ---------------------------------------------------------------------------

const centavos = z.number().int().nonnegative().nullable().default(null);
const bp = z.number().int().min(1).max(10_000).nullable().default(null);

/**
 * Uma versão do contrato do profissional. Modelos: hora, consulta, percentual e mensalidade
 * (pacote de horas, ou turno fixo quando `horasIncluidas` é nulo). O prazo de cancelamento é do
 * contrato; sem ele, vale o padrão do espaço.
 */
export const acordoSchema = z
  .object({
    profissionalId: z.uuid(),
    salaId: z.uuid().nullable().optional().default(null),
    modelo: z.enum(MODELOS),
    fluxoRecebimento: z.enum(["centralizado", "direto"]).default("direto"),
    valorHoraCentavos: centavos,
    valorConsultaCentavos: centavos,
    percentualBp: bp,
    mensalidadeCentavos: centavos,
    horasIncluidas: z.number().int().nonnegative().nullable().default(null),
    regraFalta: z.enum(["isenta", "integral", "percentual"]).default("isenta"),
    faltaPercentualBp: bp,
    prazoCancelamentoHoras: z.number().int().min(0).max(720).nullable().optional().default(null),
    multaCancelamentoReservaBp: bp,
    termos: z.string().trim().max(50_000).nullable().optional().default(null),
    observacoes: z.string().trim().max(1000).nullable().optional().default(null),
    vigenteDe: z.string().refine(dataValida, "Data de início inválida"),
    vigenteAte: z.string().refine(dataValida, "Data de término inválida").nullable().optional().default(null),
  })
  .superRefine((a, ctx) => {
    const exigir = (ok: boolean, mensagem: string) => ok || ctx.addIssue({ code: "custom", message: mensagem });
    if (a.modelo === "hora") exigir(Boolean(a.valorHoraCentavos), "Informe o valor da hora");
    if (a.modelo === "consulta") exigir(Boolean(a.valorConsultaCentavos), "Informe o valor por consulta");
    if (a.modelo === "percentual") exigir(Boolean(a.percentualBp), "Informe o percentual");
    if (a.modelo === "mensalidade") exigir(Boolean(a.mensalidadeCentavos), "Informe o valor da mensalidade");
    if (a.modelo === "mensalidade" && a.valorConsultaCentavos && a.percentualBp) {
      exigir(false, "No turno fixo, cobre por consulta ou por percentual, não os dois");
    }
    if (a.regraFalta === "percentual") exigir(Boolean(a.faltaPercentualBp), "Informe o percentual cobrado na falta");
    if (a.vigenteAte) exigir(a.vigenteAte >= a.vigenteDe, "O término deve ser depois do início");
  });

/** Só os campos relevantes ao modelo são gravados (o resto fica nulo). */
function camposDoModelo(a: z.output<typeof acordoSchema>) {
  const mensal = a.modelo === "mensalidade";
  const fixo = mensal && a.horasIncluidas === null;
  return {
    salaId: mensal ? a.salaId : null,
    valorHoraCentavos: a.modelo === "hora" || mensal ? (a.valorHoraCentavos ?? 0) : null,
    valorConsultaCentavos: a.modelo === "consulta" || (fixo && a.valorConsultaCentavos) ? a.valorConsultaCentavos : null,
    percentualBp: a.modelo === "percentual" || (fixo && a.percentualBp) ? a.percentualBp : null,
    mensalidadeCentavos: mensal ? a.mensalidadeCentavos : null,
    horasIncluidas: mensal ? a.horasIncluidas : null,
    faltaPercentualBp: a.regraFalta === "percentual" ? a.faltaPercentualBp : null,
    multaCancelamentoReservaBp: a.modelo === "hora" ? a.multaCancelamentoReservaBp : null,
  };
}

export async function carregarAcordos(tx: Transaction, profissionalId: string): Promise<(typeof acordosFinanceiros.$inferSelect)[]> {
  return tx
    .select()
    .from(acordosFinanceiros)
    .where(eq(acordosFinanceiros.profissionalId, profissionalId))
    .orderBy(asc(acordosFinanceiros.vigenteDe));
}

/** Antecedência que separa o cancelamento tardio: a do contrato vigente na data, ou a do espaço. */
export async function prazoDeCancelamento(tx: Transaction, profissionalId: string, data: DataLocal): Promise<number> {
  const contrato = acordoVigente(await carregarAcordos(tx, profissionalId), data);
  return contrato ? contrato.prazoCancelamentoHoras : prazoPadraoDoEspaco(tx);
}

/** Prazo de cancelamento padrão do espaço (contratos sem prazo próprio). */
export async function prazoPadraoDoEspaco(tx: Transaction): Promise<number> {
  const [config] = await tx.select({ horas: tenantSettings.antecedenciaCancelamentoHoras }).from(tenantSettings);
  return Math.min(config?.horas ?? 24, 720);
}

/** Próximo código CTR-AAAA-NNNN do espaço (chamar com o lock de contratos). */
async function proximoCodigo(tx: Transaction, ano: number): Promise<string> {
  const [linha] = await tx
    .select({ ultimo: sql<string | null>`max(${acordosFinanceiros.codigo})` })
    .from(acordosFinanceiros)
    .where(sql`${acordosFinanceiros.codigo} ~ ${`^CTR-${ano}-[0-9]{4}$`}`);
  const n = linha?.ultimo ? Number(linha.ultimo.slice(-4)) + 1 : 1;
  return `CTR-${ano}-${String(n).padStart(4, "0")}`;
}

/**
 * Nova versão do contrato a partir de `vigenteDe`. A versão em aberto que começou antes é
 * encerrada na véspera (reajuste) e a grade fixa dela passa para a nova versão. Sobreposição com
 * outra versão é recusada pelo banco (acordos_sem_sobreposicao).
 */
export async function inserirVersaoDoContrato(
  tx: Transaction,
  a: z.output<typeof acordoSchema>,
): Promise<{ id: string; codigo: string; anteriorId: string | null }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('contratos:' || app_current_tenant_id()::text))`);
  const anteriores = await carregarAcordos(tx, a.profissionalId);
  const aberto = anteriores.find((x) => x.vigenteAte === null && x.vigenteDe < a.vigenteDe);
  if (aberto) {
    await tx.update(acordosFinanceiros).set({ vigenteAte: somarDias(a.vigenteDe, -1) }).where(eq(acordosFinanceiros.id, aberto.id));
  }
  const codigo = await proximoCodigo(tx, Number(a.vigenteDe.slice(0, 4)));
  const [contrato] = await tx
    .insert(acordosFinanceiros)
    .values({
      codigo,
      profissionalId: a.profissionalId,
      modelo: a.modelo,
      fluxoRecebimento: a.fluxoRecebimento,
      regraFalta: a.regraFalta,
      prazoCancelamentoHoras: a.prazoCancelamentoHoras ?? (await prazoPadraoDoEspaco(tx)),
      termos: a.termos,
      observacoes: a.observacoes,
      vigenteDe: a.vigenteDe,
      vigenteAte: a.vigenteAte,
      ...camposDoModelo(a),
    })
    .returning({ id: acordosFinanceiros.id })
    .catch((erro: unknown) => {
      const pg = erroPostgres(erro);
      if (pg?.code === PG.violacaoExclusao) throw new ErroNegocio("Já existe um contrato deste profissional nesse período");
      if (pg?.code === PG.violacaoFk) throw new ErroNegocio("Profissional ou sala não encontrado");
      throw erro;
    });
  if (aberto) {
    // Reajuste: a grade fixa continua, agora ligada à versão nova.
    await tx
      .update(regrasRecorrencia)
      .set({ acordoId: contrato.id })
      .where(and(eq(regrasRecorrencia.acordoId, aberto.id), isNull(regrasRecorrencia.encerradaEm)));
  }
  await registrarAuditoria(tx, {
    acao: "contrato.criado",
    entidade: "acordos_financeiros",
    entidadeId: contrato.id,
    dados: { ...a, termos: a.termos ? "(texto)" : null, codigo, encerrouVersao: aberto?.id ?? null },
  });
  return { id: contrato.id, codigo, anteriorId: aberto?.id ?? null };
}

/** Versão do contrato sem mexer na grade (seed, testes e reajustes simples). */
export async function criarAcordo(
  ctx: ContextoTenant,
  dados: z.input<typeof acordoSchema>,
  database?: Database,
): Promise<{ id: string; codigo: string }> {
  exigirPermissao(ctx.role, "acordos.gerenciar");
  const a = acordoSchema.parse(dados);
  return withTenant(ctx, (tx) => inserirVersaoDoContrato(tx, a), database);
}

export async function listarAcordos(ctx: ContextoTenant, profissionalId: string, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ver");
  return withTenant(ctx, (tx) => carregarAcordos(tx, profissionalId), database).then((l) => l.reverse());
}

// ---------------------------------------------------------------------------
// Núcleo do ledger
// ---------------------------------------------------------------------------

/** Competência fechada não recebe lançamentos: usa a próxima aberta. */
async function competenciaAberta(tx: Transaction, profissionalId: string, competencia: DataLocal): Promise<DataLocal> {
  const fechadas = await tx
    .select({ competencia: fechamentos.competencia })
    .from(fechamentos)
    .where(and(eq(fechamentos.profissionalId, profissionalId), eq(fechamentos.status, "fechado")));
  const conjunto = new Set(fechadas.map((f) => f.competencia));
  let c = competencia;
  while (conjunto.has(c)) c = proximaCompetencia(c);
  return c;
}

/** Lançamentos da origem que não são estornos e não foram estornados. */
async function ativosDaOrigem(tx: Transaction, origem: string) {
  return tx
    .select({
      id: lancamentos.id,
      tipo: lancamentos.tipo,
      natureza: lancamentos.natureza,
      valorCentavos: lancamentos.valorCentavos,
      descricao: lancamentos.descricao,
    })
    .from(lancamentos)
    .where(
      and(
        eq(lancamentos.origem, origem),
        isNull(lancamentos.estornoDe),
        sql`not exists (select 1 from ${lancamentos} e where e.estorno_de = ${lancamentos.id})`,
      ),
    )
    .orderBy(asc(lancamentos.criadoEm));
}

type ResultadoConciliacao = { criados: number; estornados: number };

/** Ajusta o ledger da origem para refletir exatamente os lançamentos desejados. */
async function reconciliarOrigem(
  tx: Transaction,
  alvo: { profissionalId: string; origem: string; dataReferencia: DataLocal; desejados: LancamentoDesejado[] },
): Promise<ResultadoConciliacao> {
  const ativos = await ativosDaOrigem(tx, alvo.origem);
  const { estornar, criar } = conciliar(alvo.desejados, ativos);
  if (estornar.length === 0 && criar.length === 0) return { criados: 0, estornados: 0 };

  const competencia = await competenciaAberta(tx, alvo.profissionalId, competenciaDe(alvo.dataReferencia));
  for (const e of estornar) {
    await tx
      .insert(lancamentos)
      .values({
        profissionalId: alvo.profissionalId,
        competencia,
        dataReferencia: alvo.dataReferencia,
        natureza: e.natureza === "debito" ? "credito" : "debito",
        tipo: e.tipo,
        valorCentavos: e.valorCentavos,
        descricao: `Estorno: ${e.descricao}`,
        origem: alvo.origem,
        estornoDe: e.id,
        idempotencyKey: `estorno:${e.id}`,
      })
      .onConflictDoNothing();
  }
  for (const c of criar) {
    // Revisão: quantos lançamentos (não estorno) desse tipo a origem já teve.
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(lancamentos)
      .where(and(eq(lancamentos.origem, alvo.origem), eq(lancamentos.tipo, c.tipo), isNull(lancamentos.estornoDe)));
    await tx
      .insert(lancamentos)
      .values({
        profissionalId: alvo.profissionalId,
        competencia,
        dataReferencia: alvo.dataReferencia,
        ...c,
        origem: alvo.origem,
        idempotencyKey: `${c.tipo}:${alvo.origem}:${total + 1}`,
      })
      .onConflictDoNothing();
  }
  return { criados: criar.length, estornados: estornar.length };
}

/**
 * Reserva: locação por hora quando concluída; multa quando o profissional cancela tarde uma
 * data da grade fixa do contrato (turno fixo por hora). Estorna o que deixar de valer.
 */
export async function gerarLancamentosReserva(tx: Transaction, reservaId: string): Promise<ResultadoConciliacao> {
  const [r] = await tx
    .select({ reserva: reservasSala, timezone: unidades.timezone, acordoDaGrade: regrasRecorrencia.acordoId })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .leftJoin(regrasRecorrencia, eq(regrasRecorrencia.id, reservasSala.recorrenciaId))
    .where(eq(reservasSala.id, reservaId));
  if (!r) return { criados: 0, estornados: 0 };
  const data = partesLocais(r.reserva.periodo.inicio, r.timezone).data;
  const acordo = acordoVigente(await carregarAcordos(tx, r.reserva.profissionalId), data);
  const minutos = Math.round((r.reserva.periodo.fim.getTime() - r.reserva.periodo.inicio.getTime()) / 60_000);
  let desejados: LancamentoDesejado[] = [];
  if (r.reserva.status === "concluida") desejados = lancamentosDaReserva(acordo, minutos);
  if (r.reserva.status === "cancelada" && acordo && r.reserva.canceladaEm) {
    const limite = r.reserva.periodo.inicio.getTime() - acordo.prazoCancelamentoHoras * 3_600_000;
    desejados = lancamentosDaReservaCancelada(acordo, {
      minutos,
      tardia: r.reserva.canceladaEm.getTime() > limite,
      canceladaPor: r.reserva.canceladaPor,
      daGradeDoContrato: r.acordoDaGrade === acordo.id,
    });
  }
  return reconciliarOrigem(tx, { profissionalId: r.reserva.profissionalId, origem: `reserva:${reservaId}`, dataReferencia: data, desejados });
}

/** Agendamento: locação por atendimento, falta/cancelamento tardio e repasse do centralizado. */
export async function gerarLancamentosAgendamento(tx: Transaction, agendamentoId: string): Promise<ResultadoConciliacao> {
  const [a] = await tx
    .select({ agendamento: agendamentos, timezone: unidades.timezone })
    .from(agendamentos)
    .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(eq(agendamentos.id, agendamentoId));
  if (!a) return { criados: 0, estornados: 0 };
  const data = partesLocais(a.agendamento.periodo.inicio, a.timezone).data;
  const acordo = acordoVigente(await carregarAcordos(tx, a.agendamento.profissionalId), data);
  const desejados = lancamentosDoAgendamento(acordo, a.agendamento);
  return reconciliarOrigem(tx, {
    profissionalId: a.agendamento.profissionalId,
    origem: `agendamento:${agendamentoId}`,
    dataReferencia: data,
    desejados,
  });
}

/** Intervalo UTC que cobre a competência em qualquer fuso (filtro exato por data local depois). */
function janelaAmpla(competencia: DataLocal) {
  return sql`tstzrange(${instanteLocal(somarDias(competencia, -1), "00:00", "UTC").toISOString()}::timestamptz, ${instanteLocal(somarDias(proximaCompetencia(competencia), 1), "00:00", "UTC").toISOString()}::timestamptz)`;
}

/** Minutos de reservas concluídas na competência; à parte, os que não são da grade do contrato. */
async function usoDoMes(tx: Transaction, profissionalId: string, competencia: DataLocal, acordoId: string | null) {
  const linhas = await tx
    .select({ periodo: reservasSala.periodo, timezone: unidades.timezone, acordoDaGrade: regrasRecorrencia.acordoId })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .leftJoin(regrasRecorrencia, eq(regrasRecorrencia.id, reservasSala.recorrenciaId))
    .where(
      and(
        eq(reservasSala.profissionalId, profissionalId),
        eq(reservasSala.status, "concluida"),
        sql`${reservasSala.periodo} && ${janelaAmpla(competencia)}`,
      ),
    );
  const doMes = linhas.filter((l) => competenciaDe(partesLocais(l.periodo.inicio, l.timezone).data) === competencia);
  const minutos = (l: (typeof doMes)[number]) => Math.round((l.periodo.fim.getTime() - l.periodo.inicio.getTime()) / 60_000);
  return {
    total: doMes.reduce((acc, l) => acc + minutos(l), 0),
    foraDaGrade: doMes.filter((l) => !acordoId || l.acordoDaGrade !== acordoId).reduce((acc, l) => acc + minutos(l), 0),
  };
}

/** Mensalidade + excedente da competência (pelo acordo vigente no 1º dia, ou o primeiro do mês). */
async function gerarMensalidade(tx: Transaction, profissionalId: string, competencia: DataLocal) {
  const acordos = await carregarAcordos(tx, profissionalId);
  const fim = ultimoDiaDaCompetencia(competencia);
  const acordo =
    acordoVigente(acordos, competencia) ??
    acordos.find((x) => x.vigenteDe > competencia && x.vigenteDe <= fim) ??
    null;
  const desejados = lancamentosDaMensalidade(acordo, await usoDoMes(tx, profissionalId, competencia, acordo?.id ?? null));
  return reconciliarOrigem(tx, {
    profissionalId,
    origem: `competencia:${profissionalId}:${competencia.slice(0, 7)}`,
    dataReferencia: competencia,
    desejados,
  });
}

/**
 * Recalcula os lançamentos de todos os fatos geradores da competência (reservas concluídas
 * e agendamentos encerrados). Idempotente: rodar de novo não altera saldos.
 */
export async function reprocessarCompetencia(
  tx: Transaction,
  competencia: DataLocal,
  profissionalId?: string,
): Promise<ResultadoConciliacao> {
  const total: ResultadoConciliacao = { criados: 0, estornados: 0 };
  const somar = (r: ResultadoConciliacao) => {
    total.criados += r.criados;
    total.estornados += r.estornados;
  };

  const reservas = await tx
    .select({ id: reservasSala.id, periodo: reservasSala.periodo, timezone: unidades.timezone })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(
      and(
        inArray(reservasSala.status, ["concluida", "cancelada"]),
        sql`${reservasSala.periodo} && ${janelaAmpla(competencia)}`,
        profissionalId ? eq(reservasSala.profissionalId, profissionalId) : undefined,
      ),
    );
  for (const r of reservas) {
    if (competenciaDe(partesLocais(r.periodo.inicio, r.timezone).data) === competencia) somar(await gerarLancamentosReserva(tx, r.id));
  }

  const atendimentos = await tx
    .select({ id: agendamentos.id, periodo: agendamentos.periodo, timezone: unidades.timezone })
    .from(agendamentos)
    .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(
      and(
        inArray(agendamentos.status, ["realizado", "falta", "cancelado"]),
        sql`${agendamentos.periodo} && ${janelaAmpla(competencia)}`,
        profissionalId ? eq(agendamentos.profissionalId, profissionalId) : undefined,
      ),
    );
  for (const a of atendimentos) {
    if (competenciaDe(partesLocais(a.periodo.inicio, a.timezone).data) === competencia) somar(await gerarLancamentosAgendamento(tx, a.id));
  }
  return total;
}

async function timezoneDoTenant(tx: Transaction): Promise<string> {
  const [config] = await tx.select({ timezone: tenantSettings.timezone }).from(tenantSettings);
  return config?.timezone ?? "America/Sao_Paulo";
}

export const competenciaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}(-01)?$/, "Competência inválida")
  .transform((v) => (v.length === 7 ? `${v}-01` : v))
  .refine(dataValida, "Competência inválida");

export async function reprocessar(ctx: ContextoTenant, competencia: string, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ver");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const resultado = await reprocessarCompetencia(tx, c);
      await registrarAuditoria(tx, { acao: "financeiro.reprocessado", entidade: "lancamentos", dados: { competencia: c, ...resultado } });
      return resultado;
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Fechamento
// ---------------------------------------------------------------------------

async function totaisDaCompetencia(tx: Transaction, profissionalId: string, competencia: DataLocal) {
  const [anterior] = await tx
    .select({
      saldo: sql<string>`coalesce(sum(case when ${lancamentos.natureza} = 'debito' then ${lancamentos.valorCentavos} else -${lancamentos.valorCentavos} end), 0)`,
    })
    .from(lancamentos)
    .where(and(eq(lancamentos.profissionalId, profissionalId), lt(lancamentos.competencia, competencia)));
  const [mes] = await tx
    .select({
      debitos: sql<string>`coalesce(sum(${lancamentos.valorCentavos}) filter (where ${lancamentos.natureza} = 'debito'), 0)`,
      creditos: sql<string>`coalesce(sum(${lancamentos.valorCentavos}) filter (where ${lancamentos.natureza} = 'credito'), 0)`,
    })
    .from(lancamentos)
    .where(and(eq(lancamentos.profissionalId, profissionalId), eq(lancamentos.competencia, competencia)));
  const saldoAnterior = Number(anterior.saldo);
  const debitos = Number(mes.debitos);
  const creditos = Number(mes.creditos);
  return { saldoAnterior, debitos, creditos, saldoFinal: saldoAnterior + debitos - creditos };
}

/**
 * Fecha a competência do profissional: conclui reservas passadas, reprocessa os fatos,
 * gera mensalidade/excedente e congela os totais. Depois disso o mês é imutável.
 */
export async function fecharCompetencia(
  ctx: ContextoTenant,
  profissionalId: string,
  competencia: string,
  agora = new Date(),
  database?: Database,
) {
  exigirPermissao(ctx.role, "financeiro.fechar");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const hoje = hojeNoFuso(await timezoneDoTenant(tx), agora);
      if (hoje < proximaCompetencia(c)) throw new ErroNegocio("Só é possível fechar um mês depois que ele terminar");
      const [ja] = await tx
        .select({ status: fechamentos.status })
        .from(fechamentos)
        .where(and(eq(fechamentos.profissionalId, profissionalId), eq(fechamentos.competencia, c)));
      if (ja?.status === "fechado") throw new ErroNegocio("Esta competência já está fechada");
      // Competências anteriores abertas ficariam com saldo instável: feche em ordem.
      const anteriorAberta = await tx
        .select({ competencia: lancamentos.competencia })
        .from(lancamentos)
        .where(
          and(
            eq(lancamentos.profissionalId, profissionalId),
            lt(lancamentos.competencia, c),
            sql`not exists (select 1 from ${fechamentos} f where f.profissional_id = ${lancamentos.profissionalId}
              and f.competencia = ${lancamentos.competencia} and f.status = 'fechado')`,
          ),
        )
        .limit(1);
      if (anteriorAberta.length > 0) {
        throw new ErroNegocio(`Feche antes a competência ${anteriorAberta[0].competencia.slice(5, 7)}/${anteriorAberta[0].competencia.slice(0, 4)}`);
      }

      // Garante que reservas já terminadas contem como concluídas (caso o worker não tenha rodado).
      const concluidas = await tx
        .update(reservasSala)
        .set({ status: "concluida" })
        .where(
          and(
            eq(reservasSala.profissionalId, profissionalId),
            eq(reservasSala.status, "ativa"),
            sql`upper(${reservasSala.periodo}) <= ${agora.toISOString()}::timestamptz`,
          ),
        )
        .returning({ id: reservasSala.id });
      for (const r of concluidas) await gerarLancamentosReserva(tx, r.id);

      await reprocessarCompetencia(tx, c, profissionalId);
      await gerarMensalidade(tx, profissionalId, c);
      const totais = await totaisDaCompetencia(tx, profissionalId, c);
      const valores = {
        status: "fechado" as const,
        saldoAnteriorCentavos: totais.saldoAnterior,
        totalDebitosCentavos: totais.debitos,
        totalCreditosCentavos: totais.creditos,
        saldoFinalCentavos: totais.saldoFinal,
        fechadoEm: agora,
        fechadoPor: ctx.userId,
      };
      await tx
        .insert(fechamentos)
        .values({ profissionalId, competencia: c, ...valores })
        .onConflictDoUpdate({ target: [fechamentos.tenantId, fechamentos.profissionalId, fechamentos.competencia], set: valores });
      await registrarAuditoria(tx, {
        acao: "fechamento.fechado",
        entidade: "fechamentos",
        entidadeId: `${profissionalId}:${c}`,
        dados: { competencia: c, ...totais },
      });
      return totais;
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Pagamentos, ajustes e valor do atendimento
// ---------------------------------------------------------------------------

export const pagamentoSchema = z.object({
  profissionalId: z.uuid(),
  data: z.string().refine(dataValida, "Data inválida"),
  valorCentavos: z.number("Informe o valor").int().positive("O valor deve ser maior que zero"),
  direcao: z.enum(["profissional_para_espaco", "espaco_para_profissional"]),
  forma: z.enum(["pix", "dinheiro", "cartao", "transferencia", "boleto", "outro"]),
  observacao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Baixa manual: registra o pagamento e o lançamento que abate o saldo. */
/** Grava o pagamento e o lançamento que abate o saldo (dentro de uma transação de tenant). */
export async function inserirPagamento(tx: Transaction, dados: z.input<typeof pagamentoSchema>): Promise<{ id: string; lancamentoId: string }> {
  const p = pagamentoSchema.parse(dados);
  const [pagamento] = await tx.insert(pagamentos).values(p).returning({ id: pagamentos.id });
  const deProfissional = p.direcao === "profissional_para_espaco";
  const competencia = await competenciaAberta(tx, p.profissionalId, competenciaDe(p.data));
  const [lancamento] = await tx
    .insert(lancamentos)
    .values({
      profissionalId: p.profissionalId,
      competencia,
      dataReferencia: p.data,
      natureza: deProfissional ? "credito" : "debito",
      tipo: deProfissional ? "pagamento_profissional" : "repasse_profissional",
      valorCentavos: p.valorCentavos,
      descricao: `${deProfissional ? "Pagamento recebido" : "Repasse pago"} (${p.forma})${p.observacao ? ` · ${p.observacao}` : ""}`,
      origem: `pagamento:${pagamento.id}`,
      idempotencyKey: `pagamento:${pagamento.id}`,
    })
    .returning({ id: lancamentos.id });
  await registrarAuditoria(tx, { acao: "pagamento.registrado", entidade: "pagamentos", entidadeId: pagamento.id, dados: p });
  return { id: pagamento.id, lancamentoId: lancamento.id };
}

/** Estorna o lançamento de um pagamento (ex.: estorno/chargeback no Asaas). Idempotente. */
export async function estornarPagamento(tx: Transaction, pagamentoId: string, motivo: string, data: DataLocal): Promise<void> {
  const [original] = await tx
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.origem, `pagamento:${pagamentoId}`), isNull(lancamentos.estornoDe)));
  if (!original) return;
  const competencia = await competenciaAberta(tx, original.profissionalId, competenciaDe(data));
  await tx
    .insert(lancamentos)
    .values({
      profissionalId: original.profissionalId,
      competencia,
      dataReferencia: data,
      natureza: original.natureza === "debito" ? "credito" : "debito",
      tipo: original.tipo,
      valorCentavos: original.valorCentavos,
      descricao: `Estorno: ${original.descricao} · ${motivo}`,
      origem: original.origem,
      estornoDe: original.id,
      idempotencyKey: `estorno:${original.id}`,
    })
    .onConflictDoNothing();
}

/** Baixa manual: registra o pagamento e o lançamento que abate o saldo. */
export async function registrarPagamento(ctx: ContextoTenant, dados: z.input<typeof pagamentoSchema>, database?: Database) {
  exigirPermissao(ctx.role, "pagamentos.baixar");
  return withTenant(ctx, async (tx) => ({ id: (await inserirPagamento(tx, dados)).id }), database);
}

export const ajusteSchema = z.object({
  profissionalId: z.uuid(),
  data: z.string().refine(dataValida, "Data inválida"),
  natureza: z.enum(["debito", "credito"]),
  valorCentavos: z.number("Informe o valor").int().positive("O valor deve ser maior que zero"),
  descricao: z.string().trim().min(3, "Descreva o ajuste").max(200),
});

export async function lancarAjuste(ctx: ContextoTenant, dados: z.input<typeof ajusteSchema>, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ajustar");
  const a = ajusteSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const id = crypto.randomUUID();
      const competencia = await competenciaAberta(tx, a.profissionalId, competenciaDe(a.data));
      await tx.insert(lancamentos).values({
        profissionalId: a.profissionalId,
        competencia,
        dataReferencia: a.data,
        natureza: a.natureza,
        tipo: "ajuste",
        valorCentavos: a.valorCentavos,
        descricao: a.descricao,
        origem: `ajuste:${id}`,
        idempotencyKey: `ajuste:${id}`,
      });
      await registrarAuditoria(tx, { acao: "lancamento.ajuste", entidade: "lancamentos", entidadeId: id, dados: a });
      return { id };
    },
    database,
  );
}

/** Valor cobrado do paciente. Recalcula os lançamentos se o atendimento já foi encerrado. */
export async function definirValorAgendamento(
  ctx: ContextoTenant,
  agendamentoId: string,
  valorCentavos: number | null,
  agora = new Date(),
  database?: Database,
) {
  const valor = z.number().int().nonnegative("Valor inválido").nullable().parse(valorCentavos);
  return withTenant(
    ctx,
    async (tx) => {
      const [ag] = await tx.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId)).for("update");
      if (!ag) throw new ErroNegocio("Agendamento não encontrado");
      if (!pode(ctx.role, "agenda.gerenciar")) {
        exigirPermissao(ctx.role, "agenda.propria");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== ag.profissionalId) throw new ErroNegocio("Você só pode alterar os seus atendimentos");
      }
      if (ag.status === "cancelado") throw new ErroNegocio("Agendamento cancelado não tem valor");
      await tx.update(agendamentos).set({ valorCentavos: valor, valorInformadoEm: agora }).where(eq(agendamentos.id, agendamentoId));
      await registrarAuditoria(tx, {
        acao: "agendamento.valor",
        entidade: "agendamentos",
        entidadeId: agendamentoId,
        dados: { de: ag.valorCentavos, para: valor },
      });
      if (ag.status === "realizado" || ag.status === "falta") return gerarLancamentosAgendamento(tx, agendamentoId);
      return { criados: 0, estornados: 0 };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Leitura: extrato, resumo e relatórios
// ---------------------------------------------------------------------------

export type LinhaExtrato = {
  id: string;
  dataReferencia: DataLocal;
  tipo: TipoLancamento;
  natureza: Natureza;
  valorCentavos: number;
  descricao: string;
  estorno: boolean;
  saldoApos: number;
};

/** Extrato do profissional na competência, com saldo anterior e saldo acumulado linha a linha. */
export async function extrato(
  ctx: ContextoTenant,
  filtro: { profissionalId?: string; competencia: string },
  database?: Database,
) {
  const c = competenciaSchema.parse(filtro.competencia);
  return withTenant(
    ctx,
    async (tx) => {
      let profissionalId = filtro.profissionalId;
      if (!pode(ctx.role, "financeiro.ver")) {
        exigirPermissao(ctx.role, "extrato.proprio");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio) throw new ErroNegocio("Seu usuário não está vinculado a um cadastro de profissional");
        profissionalId = proprio.id;
      }
      if (!profissionalId) throw new ErroNegocio("Escolha o profissional");
      const [profissional] = await tx
        .select({ id: profissionais.id, nome: profissionais.nome })
        .from(profissionais)
        .where(eq(profissionais.id, profissionalId));
      if (!profissional) throw new ErroNegocio("Profissional não encontrado");

      const totais = await totaisDaCompetencia(tx, profissionalId, c);
      const linhas = await tx
        .select()
        .from(lancamentos)
        .where(and(eq(lancamentos.profissionalId, profissionalId), eq(lancamentos.competencia, c)))
        .orderBy(asc(lancamentos.dataReferencia), asc(lancamentos.criadoEm));
      let acumulado = totais.saldoAnterior;
      const extratoLinhas: LinhaExtrato[] = linhas.map((l) => {
        acumulado += l.natureza === "debito" ? l.valorCentavos : -l.valorCentavos;
        return {
          id: l.id,
          dataReferencia: l.dataReferencia,
          tipo: l.tipo,
          natureza: l.natureza,
          valorCentavos: l.valorCentavos,
          descricao: l.descricao,
          estorno: l.estornoDe !== null,
          saldoApos: acumulado,
        };
      });
      const [fechamento] = await tx
        .select()
        .from(fechamentos)
        .where(and(eq(fechamentos.profissionalId, profissionalId), eq(fechamentos.competencia, c)));
      const acordo = acordoVigente(await carregarAcordos(tx, profissionalId), ultimoDiaDaCompetencia(c));
      return { profissional, competencia: c, ...totais, linhas: extratoLinhas, fechamento: fechamento ?? null, acordo };
    },
    database,
  );
}

/** Visão do mês para o admin: um resumo por profissional. */
export async function resumoCompetencia(ctx: ContextoTenant, competencia: string, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ver");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const lista = await tx
        .select({ id: profissionais.id, nome: profissionais.nome, ativo: profissionais.ativo })
        .from(profissionais)
        .orderBy(asc(profissionais.nome));
      const movimentos = await tx
        .select({
          profissionalId: lancamentos.profissionalId,
          debitos: sql<string>`coalesce(sum(${lancamentos.valorCentavos}) filter (where ${lancamentos.natureza} = 'debito' and ${lancamentos.competencia} = ${c}), 0)`,
          creditos: sql<string>`coalesce(sum(${lancamentos.valorCentavos}) filter (where ${lancamentos.natureza} = 'credito' and ${lancamentos.competencia} = ${c}), 0)`,
          saldoAcumulado: sql<string>`coalesce(sum(case when ${lancamentos.natureza} = 'debito' then ${lancamentos.valorCentavos} else -${lancamentos.valorCentavos} end), 0)`,
        })
        .from(lancamentos)
        .where(lte(lancamentos.competencia, c))
        .groupBy(lancamentos.profissionalId);
      const porProfissional = new Map(movimentos.map((m) => [m.profissionalId, m]));
      const status = await tx
        .select({ profissionalId: fechamentos.profissionalId, status: fechamentos.status })
        .from(fechamentos)
        .where(eq(fechamentos.competencia, c));
      const statusPorProfissional = new Map(status.map((s) => [s.profissionalId, s.status]));
      const acordos = await tx.select().from(acordosFinanceiros).orderBy(asc(acordosFinanceiros.vigenteDe));
      const fim = ultimoDiaDaCompetencia(c);

      return lista
        .map((p) => {
          const m = porProfissional.get(p.id);
          const acordo = acordoVigente(acordos.filter((a) => a.profissionalId === p.id), fim);
          return {
            ...p,
            modelo: acordo?.modelo ?? null,
            debitos: Number(m?.debitos ?? 0),
            creditos: Number(m?.creditos ?? 0),
            saldoAcumulado: Number(m?.saldoAcumulado ?? 0),
            fechado: statusPorProfissional.get(p.id) === "fechado",
          };
        })
        .filter((p) => p.ativo || p.debitos || p.creditos || p.saldoAcumulado);
    },
    database,
  );
}

export const TIPOS_RECEITA: TipoLancamento[] = ["locacao_hora", "locacao_consulta", "locacao_percentual", "falta", "mensalidade", "excedente_horas"];

/** Receita de locação (líquida de estornos) por unidade na competência. Mensalidades não têm unidade. */
export async function receitaPorUnidade(ctx: ContextoTenant, competencia: string, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ver");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const { rows } = await tx.execute<{ unidade: string | null; receita: string }>(sql`
        select u.nome as unidade,
               sum(case when l.natureza = 'debito' then l.valor_centavos else -l.valor_centavos end) as receita
        from ${lancamentos} l
        left join ${reservasSala} r on l.origem = 'reserva:' || r.id::text
        left join ${agendamentos} a on l.origem = 'agendamento:' || a.id::text
        left join ${reservasSala} ra on ra.id = a.reserva_id
        left join ${salas} s on s.id = coalesce(r.sala_id, ra.sala_id)
        left join ${unidades} u on u.id = s.unidade_id
        where l.competencia = ${c}
          and l.tipo in (${sql.join(TIPOS_RECEITA.map((t) => sql`${t}::tipo_lancamento`), sql`, `)})
        group by u.nome
        order by u.nome nulls last
      `);
      return rows.map((r) => ({ unidade: r.unidade, receitaCentavos: Number(r.receita) }));
    },
    database,
  );
}

/** Ocupação das salas na competência: horas reservadas ÷ horas de funcionamento. */
export async function ocupacaoSalas(ctx: ContextoTenant, unidadeId: string, competencia: string, database?: Database) {
  exigirPermissao(ctx.role, "financeiro.ver");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const config = await carregarConfigUnidade(tx, unidadeId);
      if (!config) return [];
      let minutosAbertos = 0;
      for (let d = c; d < proximaCompetencia(c); d = somarDias(d, 1)) {
        minutosAbertos += intervalosDoDia(config, d).reduce((acc, i) => acc + (i.fecha - i.abre), 0);
      }
      const listaSalas = await tx
        .select({ id: salas.id, nome: salas.nome })
        .from(salas)
        .where(and(eq(salas.unidadeId, unidadeId), eq(salas.ativo, true)))
        .orderBy(asc(salas.nome));
      const reservas = await tx
        .select({ salaId: reservasSala.salaId, periodo: reservasSala.periodo })
        .from(reservasSala)
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .where(
          and(
            eq(salas.unidadeId, unidadeId),
            inArray(reservasSala.status, ["ativa", "concluida"]),
            sql`${reservasSala.periodo} && ${janelaAmpla(c)}`,
          ),
        );
      return listaSalas.map((s) => {
        const minutos = reservas
          .filter((r) => r.salaId === s.id && competenciaDe(partesLocais(r.periodo.inicio, config.timezone).data) === c)
          .reduce((acc, r) => acc + Math.round((r.periodo.fim.getTime() - r.periodo.inicio.getTime()) / 60_000), 0);
        return { ...s, minutosReservados: minutos, minutosAbertos, ocupacao: minutosAbertos ? minutos / minutosAbertos : 0 };
      });
    },
    database,
  );
}

/** Competência atual no fuso do tenant. */
export async function competenciaAtual(ctx: ContextoTenant, agora = new Date(), database?: Database): Promise<DataLocal> {
  return withTenant(ctx, async (tx) => competenciaDe(hojeNoFuso(await timezoneDoTenant(tx), agora)), database);
}

/** Últimos pagamentos do profissional (tela do financeiro). */
export async function listarPagamentos(ctx: ContextoTenant, profissionalId: string, database?: Database) {
  exigirPermissao(ctx.role, "pagamentos.baixar");
  return withTenant(
    ctx,
    (tx) =>
      tx.select().from(pagamentos).where(eq(pagamentos.profissionalId, profissionalId)).orderBy(desc(pagamentos.data)).limit(20),
    database,
  );
}


/**
 * Regra de preço do contrato vigente hoje para o próprio profissional (estimativa antes de
 * reservar), com o consumo do pacote no mês. null = sem contrato vigente.
 */
export async function minhaRegraDePreco(
  ctx: ContextoTenant,
  agora = new Date(),
  database?: Database,
): Promise<{ regra: RegraDePreco; contrato: { id: string; codigo: string | null } } | null> {
  exigirPermissao(ctx.role, "extrato.proprio");
  return withTenant(
    ctx,
    async (tx) => {
      const proprio = await profissionalDoUsuario(tx, ctx.userId);
      if (!proprio) return null;
      const hoje = hojeNoFuso(await timezoneDoTenant(tx), agora);
      const acordo = acordoVigente(await carregarAcordos(tx, proprio.id), hoje);
      if (!acordo) return null;
      const uso = await usoDoMes(tx, proprio.id, competenciaDe(hoje), acordo.id);
      return {
        regra: {
          modelo: acordo.modelo,
          valorHoraCentavos: acordo.valorHoraCentavos,
          valorConsultaCentavos: acordo.valorConsultaCentavos,
          percentualBp: acordo.percentualBp,
          mensalidadeCentavos: acordo.mensalidadeCentavos,
          horasIncluidas: acordo.horasIncluidas,
          minutosUsadosNoMes: uso.total,
        },
        contrato: { id: acordo.id, codigo: acordo.codigo },
      };
    },
    database,
  );
}
