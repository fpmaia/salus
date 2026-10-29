"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import { cancelarAcordo, criarAcordo } from "@/src/server/plataforma-acordos";

export async function criarAcordoAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    let dados: unknown;
    try {
      dados = JSON.parse(texto(formData, "acordo"));
    } catch {
      throw new ErroNegocio("Monte as parcelas antes de confirmar");
    }
    const r = await criarAcordo(usuario.id, tenantId, { ...(dados as Parameters<typeof criarAcordo>[2]), motivo: texto(formData, "motivo") });
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    revalidatePath("/plataforma/financeiro");
    return r.erros.length === 0
      ? `Acordo criado: ${r.parcelasEnviadas} parcelas enviadas ao Asaas`
      : `Acordo criado; ${r.erros.length} parcela(s) não foram ao Asaas (${r.erros[0]}). Use "Reenviar" nelas.`;
  }, { liberadaNaSuspensao: true });
}

export async function cancelarAcordoAcao(tenantId: string, acordoId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await cancelarAcordo(usuario.id, tenantId, acordoId, texto(formData, "motivo"));
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    revalidatePath("/plataforma/financeiro");
    return "Acordo cancelado: parcelas em aberto canceladas";
  }, { liberadaNaSuspensao: true });
}
