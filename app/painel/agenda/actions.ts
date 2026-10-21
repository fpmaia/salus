"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import { remarcarAgendamento } from "@/src/server/agendamentos";
import { mensagemDeErro } from "@/src/server/erros";
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
    const repetir = texto(formData, "repetir");
    if (repetir === "semanal" || repetir === "quinzenal" || repetir === "mensal") {
      const { ocorrencias } = await criarRecorrencia(ctx, {
        ...base,
        dataInicio: data,
        dataFim: textoOuUndefined(formData, "dataFim") ?? null,
        frequencia: repetir,
        diasSemana: formData.getAll("diasSemana").map(Number),
      });
      return `Reserva recorrente criada (${ocorrencias} ocorrência(s) nas próximas 8 semanas; as seguintes são geradas automaticamente)`;
    }
    await criarReserva(ctx, { ...base, data });
    return `Reserva criada para ${formatarDataBr(data)}, ${base.horaInicio}–${base.horaFim}`;
  });
}

export async function cancelarReservaAcao(reservaId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const quem = texto(formData, "quem") === "espaco" ? "espaco" : "profissional";
    await cancelarReserva(ctx, reservaId, textoOuUndefined(formData, "motivo") ?? null, new Date(), undefined, quem);
    return "Reserva cancelada";
  });
}

export async function encerrarRecorrenciaAcao(regraId: string, aPartirDe: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { canceladas, mantidas } = await encerrarRecorrencia(ctx, regraId, aPartirDe);
    const aviso = mantidas > 0 ? `; ${mantidas} com pacientes agendados continuam ativas` : "";
    return `Série encerrada a partir de ${formatarDataBr(aPartirDe)} (${canceladas} ocorrências canceladas${aviso})`;
  });
}

/** Remarcar arrastando na grade (mesmas regras do "Remarcar": nunca cobra). */
export async function remarcarArrastandoAcao(
  agendamentoId: string,
  destino: { data: string; horaInicio: string; horaFim: string; salaId: string },
): Promise<{ ok: true; mensagem: string } | { ok: false; erro: string }> {
  try {
    const ctx = await obterContextoTenant();
    const { reservaCriada } = await remarcarAgendamento(ctx, agendamentoId, destino);
    revalidatePath("/painel", "layout");
    const base = `Remarcado para ${formatarDataBr(destino.data)}, ${destino.horaInicio}`;
    return { ok: true, mensagem: reservaCriada ? `${base} (sala reservada automaticamente)` : base };
  } catch (erro) {
    unstable_rethrow(erro);
    const mensagem = mensagemDeErro(erro);
    if (!mensagem) throw erro;
    return { ok: false, erro: mensagem };
  }
}
