"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import {
  cancelarReserva,
  criarRecorrencia,
  criarReserva,
  encerrarRecorrencia,
  formatarDataBr,
} from "@/src/server/reservas";

export async function criarReservaAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const base = {
      salaId: texto(formData, "salaId"),
      profissionalId: textoOuUndefined(formData, "profissionalId"),
      horaInicio: texto(formData, "horaInicio"),
      horaFim: texto(formData, "horaFim"),
    };
    const data = texto(formData, "data");
    if (formData.get("repetir") === "on") {
      const { ocorrencias } = await criarRecorrencia(ctx, {
        ...base,
        dataInicio: data,
        dataFim: textoOuUndefined(formData, "dataFim") ?? null,
      });
      return `Reserva semanal criada (${ocorrencias} ocorrências nas próximas 8 semanas; as seguintes são geradas automaticamente)`;
    }
    await criarReserva(ctx, { ...base, data });
    return `Reserva criada para ${formatarDataBr(data)}, ${base.horaInicio}–${base.horaFim}`;
  });
}

export async function cancelarReservaAcao(reservaId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await cancelarReserva(ctx, reservaId, textoOuUndefined(formData, "motivo") ?? null);
    return "Reserva cancelada";
  });
}

export async function encerrarRecorrenciaAcao(regraId: string, aPartirDe: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { canceladas } = await encerrarRecorrencia(ctx, regraId, aPartirDe);
    return `Série encerrada a partir de ${formatarDataBr(aPartirDe)} (${canceladas} ocorrências canceladas)`;
  });
}
