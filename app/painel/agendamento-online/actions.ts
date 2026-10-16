"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { configurarAgendamentoOnline } from "@/src/server/agendamento-online";

export async function configurarOnlineAcao(profissionalId: string | undefined, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const ativo = formData.get("ativo") === "on";
    await configurarAgendamentoOnline(ctx, {
      profissionalId,
      ativo,
      duracaoConsultaMin: Number(texto(formData, "duracao") || 60),
      antecedenciaMinHoras: Number(texto(formData, "antecedencia") || 0),
      janelaDias: Number(texto(formData, "janela") || 30),
      mensagemPublica: texto(formData, "mensagem"),
    });
    return ativo ? "Agenda online ativa" : "Agenda online desativada";
  });
}
