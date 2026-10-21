"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { executarAcao } from "@/src/server/acao";
import {
  alterarPlanoClinicaPlataforma,
  banirUsuarioPlataforma,
  desbanirUsuarioPlataforma,
  reativarClinicaPlataforma,
  suspenderClinicaPlataforma,
} from "@/src/server/plataforma";

export async function suspenderClinicaPlataformaAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const usuario = await exigirUsuario();
  const tenantId = String(formData.get("tenantId") || "");
  const motivo = String(formData.get("motivo") || "Suspensão administrativa");

  return executarAcao(async () => {
    await suspenderClinicaPlataforma(usuario.id, tenantId, motivo);
    revalidatePath("/plataforma");
    revalidatePath("/plataforma/clinicas");
    return "Clínica suspensa com sucesso.";
  });
}

export async function reativarClinicaPlataformaAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const usuario = await exigirUsuario();
  const tenantId = String(formData.get("tenantId") || "");

  return executarAcao(async () => {
    await reativarClinicaPlataforma(usuario.id, tenantId);
    revalidatePath("/plataforma");
    revalidatePath("/plataforma/clinicas");
    return "Clínica reativada com sucesso.";
  });
}

export async function alterarPlanoPlataformaAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const usuario = await exigirUsuario();
  const tenantId = String(formData.get("tenantId") || "");
  const planoId = String(formData.get("planoId") || "");

  return executarAcao(async () => {
    await alterarPlanoClinicaPlataforma(usuario.id, tenantId, planoId);
    revalidatePath("/plataforma");
    revalidatePath("/plataforma/clinicas");
    return "Plano da clínica alterado com sucesso.";
  });
}

export async function banirUsuarioPlataformaAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const usuario = await exigirUsuario();
  const usuarioAlvoId = String(formData.get("userId") || "");
  const motivo = String(formData.get("motivo") || "Violação dos termos de uso");

  return executarAcao(async () => {
    await banirUsuarioPlataforma(usuario.id, usuarioAlvoId, motivo);
    revalidatePath("/plataforma");
    revalidatePath("/plataforma/usuarios");
    return "Usuário banido e sessões encerradas.";
  });
}

export async function desbanirUsuarioPlataformaAcao(
  _anterior: unknown,
  formData: FormData,
) {
  const usuario = await exigirUsuario();
  const usuarioAlvoId = String(formData.get("userId") || "");

  return executarAcao(async () => {
    await desbanirUsuarioPlataforma(usuario.id, usuarioAlvoId);
    revalidatePath("/plataforma");
    revalidatePath("/plataforma/usuarios");
    return "Usuário desbanido com sucesso.";
  });
}
