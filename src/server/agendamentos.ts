import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { agendamentos, pacientes, profissionais, reservasSala, salas, tenantSettings, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import {
  cancelamentoTardio,
  ErroAgendamento,
  STATUS_AGENDAMENTO,
  validarTransicao,
  type StatusAgendamento,
} from "../domain/agendamentos";
import { exigirPermissao, pode } from "../domain/rbac";
import { validarJanela } from "../domain/reservas";
import { dataValida, horaValida, instanteLocal, partesLocais, somarDias, type DataLocal } from "../domain/tempo";
import { acessoAPacientes, pacienteVisivel, vincularPaciente } from "./pacientes";
import { profissionalDoUsuario } from "./profissionais";
import { carregarSala, resolverProfissional, traduzirConflito } from "./reservas";
import { carregarConfigUnidade } from "./unidades";

const horaSchema = z.string().refine((v) => horaValida(v) || v === "24:00", "Horário inválido");

export const agendamentoSchema = z.object({
  pacienteId: z.uuid("Escolha o paciente"),
  profissionalId: z.uuid().optional(),
  /** Reserva onde encaixar; se omitida, procura uma reserva do profissional que contenha o horário. */
  reservaId: z.uuid().optional(),
  /** Sala para criar a reserva automaticamente quando não houver uma. */
  salaId: z.uuid().optional(),
  data: z.string().refine(dataValida, "Data inválida"),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  observacao: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null)),
});

const MENSAGENS_TRIGGER: Record<string, [ErroAgendamento["codigo"], string]> = {
  "agendamento.reserva_invalida": ["fora_da_reserva", "A reserva escolhida não está ativa"],
  "agendamento.profissional_diferente": ["fora_da_reserva", "A reserva é de outro profissional"],
  "agendamento.fora_da_reserva": ["fora_da_reserva", "O horário do atendimento precisa estar dentro da reserva da sala"],
};

function traduzirErroAgendamento(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.violacaoExclusao) {
    if (pg.constraint === "agendamentos_sem_sobreposicao_paciente") {
      throw new ErroAgendamento("conflito_paciente", "O paciente já tem outro atendimento nesse horário");
    }
    throw new ErroAgendamento("conflito_profissional", "O profissional já tem um paciente nesse horário");
  }
  if (pg?.code === PG.excecaoPlpgsql && MENSAGENS_TRIGGER[pg.message]) {
    const [codigo, mensagem] = MENSAGENS_TRIGGER[pg.message];
    throw new ErroAgendamento(codigo, mensagem);
  }
  throw erro;
}

/** Reserva ativa do profissional que contém o período (opcionalmente numa sala específica). */
async function reservaQueContem(
  tx: Transaction,
  profissionalId: string,
  periodo: { inicio: Date; fim: Date },
  salaId?: string,
) {
  const [reserva] = await tx
    .select({ id: reservasSala.id, salaId: reservasSala.salaId })
    .from(reservasSala)
    .where(
      and(
        eq(reservasSala.profissionalId, profissionalId),
        eq(reservasSala.status, "ativa"),
        salaId ? eq(reservasSala.salaId, salaId) : undefined,
        sql`${reservasSala.periodo} @> tstzrange(${periodo.inicio.toISOString()}::timestamptz, ${periodo.fim.toISOString()}::timestamptz, '[)')`,
      ),
    )
    .limit(1);
  return reserva ?? null;
}

/**
 * Agenda o paciente dentro de uma reserva do profissional. Sem reserva no horário,
 * cria uma na sala informada (se estiver livre e dentro do funcionamento).
 */
export async function criarAgendamento(
  ctx: ContextoTenant,
  dados: z.input<typeof agendamentoSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string; reservaId: string; reservaCriada: boolean }> {
  const pedido = agendamentoSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      // Agendando numa reserva específica, o profissional é o da reserva.
      let profissionalInformado = pedido.profissionalId;
      if (pedido.reservaId && !profissionalInformado && pode(ctx.role, "reservas.gerenciar")) {
        const [reserva] = await tx
          .select({ profissionalId: reservasSala.profissionalId })
          .from(reservasSala)
          .where(eq(reservasSala.id, pedido.reservaId));
        profissionalInformado = reserva?.profissionalId;
      }
      const profissionalId = await resolverProfissional(tx, ctx, profissionalInformado);
      const acesso = await acessoAPacientes(tx, ctx);
      if (!(await pacienteVisivel(tx, acesso, pedido.pacienteId))) {
        throw new ErroAgendamento("nao_encontrado", "Paciente não encontrado");
      }
      const [paciente] = await tx.select({ ativo: pacientes.ativo }).from(pacientes).where(eq(pacientes.id, pedido.pacienteId));
      if (!paciente.ativo) throw new ErroAgendamento("nao_permitido", "Este paciente está inativo");

      // Fuso/slot: da sala da reserva indicada, da sala informada ou da reserva encontrada.
      let reservaId = pedido.reservaId ?? null;
      let salaId = pedido.salaId;
      if (reservaId) {
        const [reserva] = await tx
          .select({ salaId: reservasSala.salaId, profissionalId: reservasSala.profissionalId })
          .from(reservasSala)
          .where(eq(reservasSala.id, reservaId));
        if (!reserva) throw new ErroAgendamento("fora_da_reserva", "Reserva não encontrada");
        if (reserva.profissionalId !== profissionalId) {
          throw new ErroAgendamento("fora_da_reserva", "A reserva é de outro profissional");
        }
        salaId = reserva.salaId;
      }

      let reservaCriada = false;
      let periodo: { inicio: Date; fim: Date };
      if (salaId) {
        const sala = await carregarSala(tx, salaId);
        periodo = validarJanela(pedido, sala.config, agora);
        reservaId ??= (await reservaQueContem(tx, profissionalId, periodo, salaId))?.id ?? null;
        if (!reservaId) {
          const [reserva] = await tx
            .insert(reservasSala)
            .values({ salaId, profissionalId, periodo })
            .returning({ id: reservasSala.id })
            .catch(traduzirConflito);
          reservaId = reserva.id;
          reservaCriada = true;
          await registrarAuditoria(tx, {
            acao: "reserva.criada",
            entidade: "reservas_sala",
            entidadeId: reserva.id,
            dados: { salaId, profissionalId, data: pedido.data, horaInicio: pedido.horaInicio, horaFim: pedido.horaFim, origem: "agendamento" },
          });
        }
      } else {
        // Sem sala: o horário local é interpretado no fuso de alguma reserva do profissional naquele dia.
        const candidata = await reservaDoDia(tx, profissionalId, pedido.data, pedido.horaInicio, pedido.horaFim);
        if (!candidata) {
          throw new ErroAgendamento("fora_da_reserva", "Não há reserva de sala nesse horário: escolha uma sala para reservar");
        }
        periodo = validarJanela(pedido, candidata.config, agora);
        reservaId = candidata.id;
      }

      const [agendamento] = await tx
        .insert(agendamentos)
        .values({ reservaId, profissionalId, pacienteId: pedido.pacienteId, periodo, observacao: pedido.observacao })
        .returning({ id: agendamentos.id })
        .catch(traduzirErroAgendamento);
      await vincularPaciente(tx, pedido.pacienteId, profissionalId);
      await registrarAuditoria(tx, {
        acao: "agendamento.criado",
        entidade: "agendamentos",
        entidadeId: agendamento.id,
        dados: { reservaId, profissionalId, data: pedido.data, horaInicio: pedido.horaInicio, horaFim: pedido.horaFim },
      });
      return { id: agendamento.id, reservaId, reservaCriada };
    },
    database,
  );
}

/** Reserva ativa do profissional que contém o horário local (no fuso da unidade da reserva). */
async function reservaDoDia(tx: Transaction, profissionalId: string, data: DataLocal, horaInicio: string, horaFim: string) {
  const candidatas = await tx
    .select({ id: reservasSala.id, periodo: reservasSala.periodo, unidadeId: salas.unidadeId, timezone: unidades.timezone })
    .from(reservasSala)
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
    .where(
      and(
        eq(reservasSala.profissionalId, profissionalId),
        eq(reservasSala.status, "ativa"),
        // Margem de um dia para cobrir qualquer fuso; o filtro exato é feito abaixo.
        sql`${reservasSala.periodo} && tstzrange(${instanteLocal(somarDias(data, -1), "00:00", "UTC").toISOString()}::timestamptz, ${instanteLocal(somarDias(data, 2), "00:00", "UTC").toISOString()}::timestamptz)`,
      ),
    );
  for (const c of candidatas) {
    const inicio = instanteLocal(data, horaInicio, c.timezone);
    const fim = instanteLocal(data, horaFim, c.timezone);
    if (c.periodo.inicio <= inicio && fim <= c.periodo.fim) {
      const config = await carregarConfigUnidade(tx, c.unidadeId);
      return { id: c.id, config: config! };
    }
  }
  return null;
}

export const statusSchema = z.enum(STATUS_AGENDAMENTO);

/** Muda o status (confirmar, check-in, realizado, falta, cancelar), respeitando o fluxo. */
export async function alterarStatusAgendamento(
  ctx: ContextoTenant,
  agendamentoId: string,
  para: StatusAgendamento,
  motivo: string | null = null,
  agora = new Date(),
  database?: Database,
): Promise<{ cancelamentoTardio: boolean }> {
  const destino = statusSchema.parse(para);
  return withTenant(
    ctx,
    async (tx) => {
      const [agendamento] = await tx.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId)).for("update");
      if (!agendamento) throw new ErroAgendamento("nao_encontrado", "Agendamento não encontrado");

      if (!pode(ctx.role, "agenda.gerenciar")) {
        exigirPermissao(ctx.role, "agenda.propria");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== agendamento.profissionalId) {
          throw new ErroAgendamento("nao_permitido", "Você só pode alterar os seus atendimentos");
        }
      }

      validarTransicao(agendamento.status, destino, agendamento.periodo, agora);

      let tardio = false;
      if (destino === "cancelado") {
        const [config] = await tx.select({ horas: tenantSettings.antecedenciaCancelamentoHoras }).from(tenantSettings);
        tardio = cancelamentoTardio(agendamento.periodo.inicio, agora, config?.horas ?? 24);
      }
      await tx
        .update(agendamentos)
        .set({
          status: destino,
          statusAtualizadoEm: agora,
          ...(destino === "cancelado"
            ? { canceladoEm: agora, motivoCancelamento: motivo?.trim() || null, cancelamentoTardio: tardio }
            : {}),
        })
        .where(eq(agendamentos.id, agendamentoId))
        .catch(traduzirErroAgendamento);
      await registrarAuditoria(tx, {
        acao: `agendamento.${destino}`,
        entidade: "agendamentos",
        entidadeId: agendamentoId,
        dados: { de: agendamento.status, para: destino, ...(destino === "cancelado" ? { tardio } : {}) },
      });
      return { cancelamentoTardio: tardio };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type AtendimentoDoDia = {
  id: string;
  reservaId: string;
  horaInicio: string;
  horaFim: string;
  inicio: Date;
  fim: Date;
  status: StatusAgendamento;
  cancelamentoTardio: boolean;
  observacao: string | null;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string | null;
  profissionalNome: string;
  salaNome: string;
};

async function listarAtendimentos(
  tx: Transaction,
  ctx: ContextoTenant,
  filtro: { inicio: Date; fim: Date; timezone: string; unidadeId?: string; reservaIds?: string[] },
): Promise<AtendimentoDoDia[]> {
  let somenteProfissional: string | null = null;
  if (!pode(ctx.role, "agenda.gerenciar")) {
    exigirPermissao(ctx.role, "agenda.propria");
    const proprio = await profissionalDoUsuario(tx, ctx.userId);
    if (!proprio) return [];
    somenteProfissional = proprio.id;
  }
  const linhas = await tx
    .select({
      id: agendamentos.id,
      reservaId: agendamentos.reservaId,
      periodo: agendamentos.periodo,
      status: agendamentos.status,
      cancelamentoTardio: agendamentos.cancelamentoTardio,
      observacao: agendamentos.observacao,
      pacienteId: pacientes.id,
      pacienteNome: pacientes.nome,
      pacienteTelefone: pacientes.telefone,
      profissionalNome: profissionais.nome,
      salaNome: salas.nome,
    })
    .from(agendamentos)
    .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
    .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
    .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
    .innerJoin(salas, eq(salas.id, reservasSala.salaId))
    .where(
      and(
        sql`${agendamentos.periodo} && tstzrange(${filtro.inicio.toISOString()}::timestamptz, ${filtro.fim.toISOString()}::timestamptz)`,
        filtro.unidadeId ? eq(salas.unidadeId, filtro.unidadeId) : undefined,
        filtro.reservaIds ? inArray(agendamentos.reservaId, filtro.reservaIds) : undefined,
        somenteProfissional ? eq(agendamentos.profissionalId, somenteProfissional) : undefined,
      ),
    )
    .orderBy(asc(agendamentos.periodo), asc(profissionais.nome));
  return linhas.map(({ periodo, ...l }) => ({
    ...l,
    inicio: periodo.inicio,
    fim: periodo.fim,
    horaInicio: partesLocais(periodo.inicio, filtro.timezone).hora,
    horaFim: partesLocais(periodo.fim, filtro.timezone).hora,
  }));
}

/** Atendimentos do dia na unidade (recepção/admin: todos; profissional: os seus). */
export async function atendimentosDoDia(ctx: ContextoTenant, unidadeId: string, data: DataLocal, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const config = await carregarConfigUnidade(tx, unidadeId);
      if (!config) return null;
      const inicio = instanteLocal(data, "00:00", config.timezone);
      const fim = instanteLocal(somarDias(data, 1), "00:00", config.timezone);
      return { config, atendimentos: await listarAtendimentos(tx, ctx, { inicio, fim, timezone: config.timezone, unidadeId }) };
    },
    database,
  );
}

/** Atendimentos de uma reserva (painel de detalhe na agenda). */
export async function atendimentosDaReserva(ctx: ContextoTenant, reservaId: string, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const [reserva] = await tx
        .select({ periodo: reservasSala.periodo, timezone: unidades.timezone })
        .from(reservasSala)
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(eq(reservasSala.id, reservaId));
      if (!reserva) return [];
      return listarAtendimentos(tx, ctx, { ...reserva.periodo, timezone: reserva.timezone, reservaIds: [reservaId] });
    },
    database,
  );
}
