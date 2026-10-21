import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { agendamentos, cobrancasProfissional, pacientes, reservasSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { STATUS_ATIVOS, type StatusAgendamento } from "../domain/agendamentos";
import { exigirPermissao } from "../domain/rbac";
import { competenciaDe } from "../domain/financeiro";
import { hojeNoFuso, partesLocais, somarDias, type DataLocal } from "../domain/tempo";
import { atendimentosDoDia, type AtendimentoDoDia } from "./agendamentos";
import { pagamentoOnlineAtivo } from "./cobrancas";
import { competenciaAtual, extrato, ocupacaoSalas, receitaPorUnidade, resumoCompetencia } from "./financeiro";
import { profissionalDoUsuario } from "./profissionais";
import { minhasProximasReservas, obterPanoramaSalas, type SalaPanorama } from "./reservas";
import { listarUnidades } from "./unidades";

// Início por papel: recepção vê "Hoje", o profissional "Minha semana" e o admin "Mês".

const ANTERIOR = (c: DataLocal) => competenciaDe(somarDias(c, -1));

/** Recepção (e admin): o dia de todas as unidades ativas. */
export async function painelHoje(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  const ativas = (await listarUnidades(ctx, database)).filter((u) => u.ativo);
  const atendimentos: (AtendimentoDoDia & { unidadeNome: string })[] = [];
  const salasAgora: (SalaPanorama & { unidadeNome: string })[] = [];
  for (const u of ativas) {
    const dia = await atendimentosDoDia(ctx, u.id, hojeNoFuso(u.timezone, agora), database);
    for (const a of dia?.atendimentos ?? []) atendimentos.push({ ...a, unidadeNome: u.nome });
    const panorama = await obterPanoramaSalas(ctx, u.id, agora, database);
    for (const s of panorama?.salas ?? []) salasAgora.push({ ...s, unidadeNome: u.nome });
  }
  atendimentos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const ainda = (s: StatusAgendamento) => s === "agendado" || s === "confirmado";
  return {
    total: atendimentos.filter((a) => a.status !== "cancelado").length,
    realizadas: atendimentos.filter((a) => a.status === "realizado").length,
    // Chegou e espera ser chamado.
    naRecepcao: atendimentos.filter((a) => a.status === "presente"),
    // Já passou do horário e ninguém marcou chegada.
    atrasados: atendimentos.filter((a) => ainda(a.status) && a.inicio <= agora),
    // Ainda não confirmados, mais tarde hoje.
    aConfirmar: atendimentos.filter((a) => a.status === "agendado" && a.inicio > agora),
    proximos: atendimentos.filter((a) => ainda(a.status) && a.inicio > agora).slice(0, 8),
    salasLivres: salasAgora.filter((s) => s.estado === "livre"),
    salasOcupadas: salasAgora.filter((s) => s.estado !== "livre").length,
  };
}

export type ConsultaDaSemana = {
  id: string;
  data: DataLocal;
  horaInicio: string;
  horaFim: string;
  status: StatusAgendamento;
  pacienteId: string;
  pacienteNome: string;
  salaNome: string;
  unidadeNome: string;
};

/** Profissional: consultas dos próximos 7 dias, próximas reservas e o saldo com o espaço. */
export async function minhaSemana(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "extrato.proprio");
  const consultas = await withTenant(
    ctx,
    async (tx): Promise<ConsultaDaSemana[]> => {
      const proprio = await profissionalDoUsuario(tx, ctx.userId);
      if (!proprio) return [];
      const fim = new Date(agora.getTime() + 7 * 86_400_000);
      const linhas = await tx
        .select({
          id: agendamentos.id,
          periodo: agendamentos.periodo,
          status: agendamentos.status,
          pacienteId: pacientes.id,
          pacienteNome: pacientes.nome,
          salaNome: salas.nome,
          unidadeNome: unidades.nome,
          timezone: unidades.timezone,
        })
        .from(agendamentos)
        .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
        .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(
          and(
            eq(agendamentos.profissionalId, proprio.id),
            inArray(agendamentos.status, [...STATUS_ATIVOS]),
            sql`${agendamentos.periodo} && tstzrange(${agora.toISOString()}::timestamptz, ${fim.toISOString()}::timestamptz)`,
          ),
        )
        .orderBy(asc(agendamentos.periodo));
      return linhas.map(({ periodo, timezone, ...l }) => {
        const ini = partesLocais(periodo.inicio, timezone);
        return { ...l, data: ini.data, horaInicio: ini.hora, horaFim: partesLocais(periodo.fim, timezone).hora };
      });
    },
    database,
  );
  const competencia = await competenciaAtual(ctx, agora, database);
  const conta = await extrato(ctx, { competencia: competencia.slice(0, 7) }, database).catch(() => null);
  return {
    consultas,
    reservas: await minhasProximasReservas(ctx, agora, 5, database),
    saldo: conta?.saldoFinal ?? 0,
    previsto: (conta?.previsto ?? []).reduce((acc, p) => acc + p.valorCentavos, 0),
    pagamentoOnline: await pagamentoOnlineAtivo(ctx, database),
  };
}

/** Admin: o mês corrente (receita, ocupação, inadimplência) e o fechamento do mês anterior. */
export async function resumoDoMes(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "financeiro.fechar");
  const competencia = await competenciaAtual(ctx, agora, database);
  const c = competencia.slice(0, 7);
  const [resumo, receita, anterior] = [
    await resumoCompetencia(ctx, c, database),
    await receitaPorUnidade(ctx, c, database),
    await resumoCompetencia(ctx, ANTERIOR(competencia).slice(0, 7), database),
  ];
  let minutosReservados = 0;
  let minutosAbertos = 0;
  for (const u of (await listarUnidades(ctx, database)).filter((x) => x.ativo)) {
    for (const s of await ocupacaoSalas(ctx, u.id, c, database)) {
      minutosReservados += s.minutosReservados;
      minutosAbertos += s.minutosAbertos;
    }
  }
  const vencidas = await withTenant(
    ctx,
    async (tx) =>
      (
        await tx
          .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${cobrancasProfissional.valorCentavos}), 0)::int` })
          .from(cobrancasProfissional)
          .where(eq(cobrancasProfissional.status, "vencida"))
      )[0],
    database,
  );
  return {
    competencia,
    receitaCentavos: receita.reduce((acc, r) => acc + r.receitaCentavos, 0),
    ocupacao: minutosAbertos ? minutosReservados / minutosAbertos : 0,
    aReceberCentavos: resumo.filter((p) => p.saldoAcumulado > 0).reduce((acc, p) => acc + p.saldoAcumulado, 0),
    devedores: resumo.filter((p) => p.saldoAcumulado > 0).length,
    cobrancasVencidas: vencidas,
    semContrato: resumo.filter((p) => p.ativo && !p.modelo).map((p) => ({ id: p.id, nome: p.nome })),
    anterior: { competencia: ANTERIOR(competencia), abertos: anterior.filter((p) => !p.fechado).length },
  };
}
