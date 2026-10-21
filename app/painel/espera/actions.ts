"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto, textoOuUndefined } from "@/src/server/acao";
import { adicionarNaEspera, removerDaEspera } from "@/src/server/lista-espera";

export async function adicionarNaEsperaAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await adicionarNaEspera(ctx, {
      pacienteId: texto(formData, "pacienteId"),
      profissionalId: textoOuUndefined(formData, "profissionalId"),
      preferencia: texto(formData, "preferencia"),
    });
    return "Paciente adicionado à lista de espera";
  });
}

export async function removerDaEsperaAcao(id: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await removerDaEspera(ctx, id);
    return "Removido da lista de espera";
  });
}
