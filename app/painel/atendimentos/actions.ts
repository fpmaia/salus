"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import type { StatusAgendamento } from "@/src/domain/agendamentos";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import { ROTULOS_STATUS } from "@/src/domain/agendamentos";
import { alterarStatusAgendamento, criarAgendamento, desfazerStatus, remarcarAgendamento } from "@/src/server/agendamentos";
import { formatarDataBr } from "@/src/server/reservas";

export async function criarAgendamentoAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const data = texto(formData, "data");
    const { reservaCriada } = await criarAgendamento(ctx, {
      pacienteId: texto(formData, "pacienteId"),
      profissionalId: textoOuUndefined(formData, "profissionalId"),
      reservaId: textoOuUndefined(formData, "reservaId"),
      salaId: textoOuUndefined(formData, "salaId"),
      data,
      horaInicio: texto(formData, "horaInicio"),
      horaFim: texto(formData, "horaFim"),
      observacao: texto(formData, "observacao"),
    });
    const base = `Agendado para ${formatarDataBr(data)}, ${texto(formData, "horaInicio")}`;
    return reservaCriada ? `${base} (sala reservada automaticamente)` : base;
  });
}

const MENSAGENS: Partial<Record<StatusAgendamento, string>> = {
  confirmado: "Confirmado",
  presente: "Chegada registrada",
  realizado: "Consulta realizada",
  falta: "Falta registrada",
};

export async function alterarStatusAcao(
  agendamentoId: string,
  para: StatusAgendamento,
  _estado: EstadoAcao,
  formData: FormData,
) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const quem = (["paciente", "profissional", "espaco"].includes(texto(formData, "quem")) ? texto(formData, "quem") : "paciente") as
      | "paciente"
      | "profissional"
      | "espaco";
    const { cancelamentoTardio } = await alterarStatusAgendamento(
      ctx,
      agendamentoId,
      para,
      textoOuUndefined(formData, "motivo") ?? null,
      new Date(),
      undefined,
      quem,
    );
    if (para === "cancelado") return cancelamentoTardio ? "Cancelado (cancelamento tardio)" : "Cancelado";
    return MENSAGENS[para] ?? "Atualizado";
  });
}

export async function remarcarAcao(agendamentoId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const data = texto(formData, "data");
    const { reservaCriada } = await remarcarAgendamento(ctx, agendamentoId, {
      data,
      horaInicio: texto(formData, "horaInicio"),
      horaFim: texto(formData, "horaFim"),
      salaId: textoOuUndefined(formData, "salaId"),
    });
    const base = `Remarcado para ${formatarDataBr(data)}, ${texto(formData, "horaInicio")}`;
    return reservaCriada ? `${base} (sala reservada automaticamente)` : base;
  });
}

export async function desfazerStatusAcao(agendamentoId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { status } = await desfazerStatus(ctx, agendamentoId);
    return `Desfeito: voltou para "${ROTULOS_STATUS[status]}"`;
  });
}
