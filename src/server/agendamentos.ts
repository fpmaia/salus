import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { agendamentos, pacientes, profissionais, reservasSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import {
  cancelamentoTardio,
  ErroAgendamento,
  STATUS_AGENDAMENTO,
  STATUS_ATIVOS,
  validarTransicao,
  type StatusAgendamento,
  type AtendimentoDoDia,
  DESFAZER_STATUS_HORAS,
  podeDesfazerStatus,
} from "../domain/agendamentos";
export { type AtendimentoDoDia, DESFAZER_STATUS_HORAS, podeDesfazerStatus };
import { exigirPermissao, pode } from "../domain/rbac";
import { ErroReserva, validarJanela } from "../domain/reservas";
import { dataValida, horaValida, instanteLocal, partesLocais, somarDias, type DataLocal } from "../domain/tempo";
import type { QuemCancelou } from "../domain/financeiro";
import { gerarLancamentosAgendamento, gerarLancamentosReserva, prazoDeCancelamento } from "./financeiro";
import { baixarDaEspera } from "./lista-espera";
import { cancelarNotificacoesDoAgendamento, reativarNotificacoesDoAgendamento } from "./outbox";
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

type Encaixe = { data: DataLocal; horaInicio: string; horaFim: string; reservaId?: string; salaId?: string };

/**
 * Reserva onde o horário cabe: a indicada, uma do profissional que contenha o horário ou,
 * sem nenhuma, uma nova na sala informada (marcada como criada pelo agendamento).
 */
async function encaixarNaReserva(
  tx: Transaction,
  profissionalId: string,
  pedido: Encaixe,
  agora: Date,
): Promise<{ reservaId: string; periodo: { inicio: Date; fim: Date }; reservaCriada: boolean }> {
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
        .values({ salaId, profissionalId, periodo, criadaPeloAgendamento: true })
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
  return { reservaId: reservaId!, periodo, reservaCriada };
}

/** Motivo gravado na reserva automática liberada (permite reativá-la ao desfazer). */
const MOTIVO_LIBERADA = "Liberada: o atendimento saiu deste horário";

/**
 * Libera a reserva criada sozinha pelo agendamento quando não sobra atendimento ativo nela
 * e ela ainda não começou. Não gera cobrança (reserva fora da grade não tem multa).
 */
async function liberarReservaAutomatica(tx: Transaction, reservaId: string, agora: Date): Promise<boolean> {
  const [reserva] = await tx.select().from(reservasSala).where(eq(reservasSala.id, reservaId)).for("update");
  if (!reserva || !reserva.criadaPeloAgendamento || reserva.status !== "ativa") return false;
  if (reserva.periodo.inicio.getTime() <= agora.getTime()) return false;
  const [{ ativos }] = await tx
    .select({ ativos: sql<number>`count(*)::int` })
    .from(agendamentos)
    .where(and(eq(agendamentos.reservaId, reservaId), inArray(agendamentos.status, [...STATUS_ATIVOS])));
  if (ativos > 0) return false;
  await tx
    .update(reservasSala)
    .set({ status: "cancelada", canceladaEm: agora, canceladaPor: "espaco", motivoCancelamento: MOTIVO_LIBERADA })
    .where(eq(reservasSala.id, reservaId));
  await gerarLancamentosReserva(tx, reservaId);
  await registrarAuditoria(tx, {
    acao: "reserva.liberada",
    entidade: "reservas_sala",
    entidadeId: reservaId,
    dados: { motivo: MOTIVO_LIBERADA },
  });
  return true;
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

      const { reservaId, periodo, reservaCriada } = await encaixarNaReserva(tx, profissionalId, pedido, agora);

      const [agendamento] = await tx
        .insert(agendamentos)
        .values({ reservaId, profissionalId, pacienteId: pedido.pacienteId, periodo, observacao: pedido.observacao })
        .returning({ id: agendamentos.id })
        .catch(traduzirErroAgendamento);
      await vincularPaciente(tx, pedido.pacienteId, profissionalId);
      await baixarDaEspera(tx, pedido.pacienteId, profissionalId, agendamento.id);
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
/**
 * Núcleo da mudança de status (já dentro de uma transação de tenant): valida o fluxo,
 * marca cancelamento tardio, gera os lançamentos e audita. `origem` vai para o audit_log.
 */
export async function aplicarStatusAgendamento(
  tx: Transaction,
  agendamento: typeof agendamentos.$inferSelect,
  destino: StatusAgendamento,
  motivo: string | null,
  agora: Date,
  origem: "equipe" | "paciente" = "equipe",
  /** Quem pediu o cancelamento (pelo link, sempre o paciente). */
  quem: QuemCancelou = "paciente",
): Promise<{ cancelamentoTardio: boolean }> {
  validarTransicao(agendamento.status, destino, agendamento.periodo, agora);

  let tardio = false;
  const canceladoPor: QuemCancelou = origem === "paciente" ? "paciente" : quem;
  if (destino === "cancelado") {
    // O prazo é o do contrato vigente na data da consulta (ou o padrão do espaço).
    const [local] = await tx
      .select({ timezone: unidades.timezone })
      .from(reservasSala)
      .innerJoin(salas, eq(salas.id, reservasSala.salaId))
      .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
      .where(eq(reservasSala.id, agendamento.reservaId));
    const data = partesLocais(agendamento.periodo.inicio, local?.timezone ?? "America/Sao_Paulo").data;
    tardio = cancelamentoTardio(agendamento.periodo.inicio, agora, await prazoDeCancelamento(tx, agendamento.profissionalId, data));
  }
  await tx
    .update(agendamentos)
    .set({
      status: destino,
      statusAnterior: agendamento.status,
      statusAtualizadoEm: agora,
      ...(destino === "cancelado"
        ? { canceladoEm: agora, canceladoPor, motivoCancelamento: motivo?.trim() || null, cancelamentoTardio: tardio }
        : {}),
    })
    .where(eq(agendamentos.id, agendamento.id))
    .catch(traduzirErroAgendamento);
  // Fato gerador do financeiro (realizado, falta, cancelamento tardio).
  if (destino === "realizado" || destino === "falta" || destino === "cancelado") {
    await gerarLancamentosAgendamento(tx, agendamento.id);
  }
  // Cancelado com antecedência (ou pelo espaço): a sala reservada só para ele volta a ficar livre.
  // Cancelado tarde pelo paciente/profissional, a reserva fica (o profissional paga a sala).
  if (destino === "cancelado" && (!tardio || canceladoPor === "espaco")) {
    await liberarReservaAutomatica(tx, agendamento.reservaId, agora);
  }
  // Lembretes pendentes perdem o sentido quando o agendamento sai do fluxo ativo.
  if (destino === "cancelado" || destino === "falta" || destino === "realizado") {
    await cancelarNotificacoesDoAgendamento(tx, agendamento.id, `Agendamento ${destino}`);
  }
  await registrarAuditoria(tx, {
    acao: `agendamento.${destino}`,
    entidade: "agendamentos",
    entidadeId: agendamento.id,
    dados: { de: agendamento.status, para: destino, origem, ...(destino === "cancelado" ? { tardio, canceladoPor } : {}) },
  });
  return { cancelamentoTardio: tardio };
}

/** Muda o status (confirmar, check-in, realizado, falta, cancelar), respeitando o fluxo. */
export async function alterarStatusAgendamento(
  ctx: ContextoTenant,
  agendamentoId: string,
  para: StatusAgendamento,
  motivo: string | null = null,
  agora = new Date(),
  database?: Database,
  quem: QuemCancelou = "paciente",
): Promise<{ cancelamentoTardio: boolean }> {
  const destino = statusSchema.parse(para);
  return withTenant(
    ctx,
    async (tx) => {
      const agendamento = await agendamentoEditavel(tx, ctx, agendamentoId);
      // Só a equipe registra cancelamento pelo espaço (que isenta o profissional).
      const autor = quem === "espaco" && !pode(ctx.role, "agenda.gerenciar") ? "profissional" : quem;
      return aplicarStatusAgendamento(tx, agendamento, destino, motivo, agora, "equipe", autor);
    },
    database,
  );
}

/** Carrega o agendamento travado e confere se o usuário pode mexer nele. */
async function agendamentoEditavel(tx: Transaction, ctx: ContextoTenant, agendamentoId: string) {
  const [agendamento] = await tx.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId)).for("update");
  if (!agendamento) throw new ErroAgendamento("nao_encontrado", "Agendamento não encontrado");
  if (!pode(ctx.role, "agenda.gerenciar")) {
    exigirPermissao(ctx.role, "agenda.propria");
    const proprio = await profissionalDoUsuario(tx, ctx.userId);
    if (!proprio || proprio.id !== agendamento.profissionalId) {
      throw new ErroAgendamento("nao_permitido", "Você só pode alterar os seus atendimentos");
    }
  }
  return agendamento;
}

export const remarcacaoSchema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  /** Sala do novo horário; omitida, fica a sala atual. */
  salaId: z.uuid().optional(),
});

/**
 * Move o atendimento para outro horário mantendo o mesmo registro (e o histórico).
 * Volta a "agendado", descarta os lembretes do horário antigo e nunca gera cobrança;
 * a reserva criada só para o horário antigo é liberada.
 */
export async function remarcarAgendamento(
  ctx: ContextoTenant,
  agendamentoId: string,
  dados: z.input<typeof remarcacaoSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ reservaId: string; reservaCriada: boolean }> {
  const pedido = remarcacaoSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const agendamento = await agendamentoEditavel(tx, ctx, agendamentoId);
      if (agendamento.status !== "agendado" && agendamento.status !== "confirmado") {
        throw new ErroAgendamento("transicao_invalida", "Só é possível remarcar um atendimento agendado ou confirmado");
      }
      const [atual] = await tx
        .select({ salaId: reservasSala.salaId })
        .from(reservasSala)
        .where(eq(reservasSala.id, agendamento.reservaId));
      const destino = await encaixarNaReserva(
        tx,
        agendamento.profissionalId,
        { ...pedido, salaId: pedido.salaId ?? atual.salaId },
        agora,
      );
      await tx
        .update(agendamentos)
        .set({
          reservaId: destino.reservaId,
          periodo: destino.periodo,
          status: "agendado",
          statusAnterior: null,
          statusAtualizadoEm: agora,
          remarcadoEm: agora,
        })
        .where(eq(agendamentos.id, agendamentoId))
        .catch(traduzirErroAgendamento);
      await cancelarNotificacoesDoAgendamento(tx, agendamentoId, "Agendamento remarcado");
      if (destino.reservaId !== agendamento.reservaId) {
        await liberarReservaAutomatica(tx, agendamento.reservaId, agora);
      }
      await registrarAuditoria(tx, {
        acao: "agendamento.remarcado",
        entidade: "agendamentos",
        entidadeId: agendamentoId,
        dados: {
          de: { reservaId: agendamento.reservaId, inicio: agendamento.periodo.inicio.toISOString(), fim: agendamento.periodo.fim.toISOString() },
          para: { reservaId: destino.reservaId, data: pedido.data, horaInicio: pedido.horaInicio, horaFim: pedido.horaFim },
        },
      });
      return { reservaId: destino.reservaId, reservaCriada: destino.reservaCriada };
    },
    database,
  );
}

/**
 * Desfaz a última mudança de status (clique errado): volta ao status anterior, limpa os dados
 * do cancelamento, reativa a reserva liberada e reconcilia o financeiro. Só a equipe, até 24h.
 */
export async function desfazerStatus(
  ctx: ContextoTenant,
  agendamentoId: string,
  agora = new Date(),
  database?: Database,
): Promise<{ status: StatusAgendamento }> {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  return withTenant(
    ctx,
    async (tx) => {
      const agendamento = await agendamentoEditavel(tx, ctx, agendamentoId);
      const anterior = agendamento.statusAnterior;
      if (!anterior) throw new ErroAgendamento("nao_permitido", "Não há mudança de status para desfazer");
      if (!podeDesfazerStatus(agendamento, agora)) {
        throw new ErroAgendamento("nao_permitido", `Só é possível desfazer até ${DESFAZER_STATUS_HORAS}h depois da mudança`);
      }

      // A reserva liberada pelo cancelamento volta (se ninguém ocupou a sala nesse meio-tempo).
      const [reserva] = await tx.select().from(reservasSala).where(eq(reservasSala.id, agendamento.reservaId)).for("update");
      let reservaReativada = false;
      if (reserva.status === "cancelada") {
        if (!reserva.criadaPeloAgendamento || reserva.motivoCancelamento !== MOTIVO_LIBERADA) {
          throw new ErroAgendamento("nao_permitido", "A reserva da sala foi cancelada: agende de novo");
        }
        await tx
          .update(reservasSala)
          .set({ status: "ativa", canceladaEm: null, canceladaPor: null, motivoCancelamento: null })
          .where(eq(reservasSala.id, reserva.id))
          .catch(traduzirConflito)
          .catch((erro) => {
            if (erro instanceof ErroReserva) throw new ErroAgendamento("sala_ocupada", erro.message);
            throw erro;
          });
        reservaReativada = true;
      }

      await tx
        .update(agendamentos)
        .set({
          status: anterior,
          statusAnterior: null,
          statusAtualizadoEm: agora,
          ...(agendamento.status === "cancelado"
            ? { canceladoEm: null, canceladoPor: null, motivoCancelamento: null, cancelamentoTardio: false }
            : {}),
        })
        .where(eq(agendamentos.id, agendamentoId))
        .catch(traduzirErroAgendamento);
      await gerarLancamentosAgendamento(tx, agendamentoId);
      if (reservaReativada) await gerarLancamentosReserva(tx, reserva.id);
      if (STATUS_ATIVOS.includes(anterior)) {
        await reativarNotificacoesDoAgendamento(tx, agendamentoId, `Agendamento ${agendamento.status}`);
      }
      await registrarAuditoria(tx, {
        acao: "agendamento.status_desfeito",
        entidade: "agendamentos",
        entidadeId: agendamentoId,
        dados: { de: agendamento.status, para: anterior, reservaReativada },
      });
      return { status: anterior };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------


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
      statusAnterior: agendamentos.statusAnterior,
      statusAtualizadoEm: agendamentos.statusAtualizadoEm,
      remarcadoEm: agendamentos.remarcadoEm,
      cancelamentoTardio: agendamentos.cancelamentoTardio,
      valorCentavos: agendamentos.valorCentavos,
      origem: agendamentos.origem,
      observacao: agendamentos.observacao,
      pacienteId: pacientes.id,
      pacienteNome: pacientes.nome,
      pacienteTelefone: pacientes.telefone,
      profissionalId: agendamentos.profissionalId,
      profissionalNome: profissionais.nome,
      salaId: salas.id,
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
