"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import {
  alterarPlanoClinicaPlataforma,
  banirUsuarioPlataforma,
  desbanirUsuarioPlataforma,
  reativarClinicaPlataforma,
  suspenderClinicaPlataforma,
} from "@/src/server/plataforma";
import { cancelarContaClinica, criarNotaClinica, encerrarSessoesUsuario } from "@/src/server/plataforma-clinica";

// Ações da ficha da clínica (aba Resumo e Acessos): conta, plano, acessos e notas.

function revalidar(tenantId: string) {
  revalidatePath(`/plataforma/clinicas/${tenantId}`);
  revalidatePath("/plataforma/clinicas");
  revalidatePath("/plataforma");
}

export async function suspenderContaAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await suspenderClinicaPlataforma(usuario.id, tenantId, texto(formData, "motivo").trim());
    revalidar(tenantId);
    return "Clínica suspensa: a equipe dela vê o motivo ao entrar";
  }, { liberadaNaSuspensao: true });
}

export async function reativarContaAcao(tenantId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await reativarClinicaPlataforma(usuario.id, tenantId);
    revalidar(tenantId);
    return "Clínica reativada";
  }, { liberadaNaSuspensao: true });
}

export async function trocarPlanoContaAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await alterarPlanoClinicaPlataforma(usuario.id, tenantId, texto(formData, "planoId"));
    revalidar(tenantId);
    return "Plano alterado: vale já para os limites e para a próxima fatura";
  }, { liberadaNaSuspensao: true });
}

export async function cancelarContaAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const { faturasCanceladas } = await cancelarContaClinica(usuario.id, tenantId, { confirmacao: texto(formData, "confirmacao"), motivo: texto(formData, "motivo") });
    revalidar(tenantId);
    return `Conta cancelada${faturasCanceladas > 0 ? `; ${faturasCanceladas} fatura(s) em aberto cancelada(s)` : ""}`;
  }, { liberadaNaSuspensao: true });
}

export async function encerrarSessoesAcao(tenantId: string, alvoId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const qtd = await encerrarSessoesUsuario(usuario.id, alvoId);
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    return qtd > 0 ? `${qtd} sessão(ões) encerrada(s): precisa entrar de novo` : "Não havia sessão aberta";
  }, { liberadaNaSuspensao: true });
}

export async function banirAcessoAcao(tenantId: string, alvoId: string, banir: boolean, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    if (banir) await banirUsuarioPlataforma(usuario.id, alvoId, texto(formData, "motivo").trim() || "Bloqueado pela equipe Salus");
    else await desbanirUsuarioPlataforma(usuario.id, alvoId);
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    revalidatePath("/plataforma/usuarios");
    return banir ? "Usuário bloqueado e sessões encerradas" : "Usuário desbloqueado";
  }, { liberadaNaSuspensao: true });
}

export async function criarNotaAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await criarNotaClinica(usuario.id, tenantId, texto(formData, "texto"));
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    return "Nota registrada";
  }, { liberadaNaSuspensao: true });
}
