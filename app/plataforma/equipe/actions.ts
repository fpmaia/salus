"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/src/auth/sessao";
import { ROTULOS_PAPEL_PLATAFORMA } from "@/src/domain/permissoes-plataforma";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { enviarEmailConvite } from "@/src/server/convites-email";
import { emailConviteEquipePlataforma } from "@/src/server/email-modelos";
import {
  aceitarConviteEquipePlataforma,
  convidarParaEquipePlataforma,
  definirPapelPlataforma,
  removerDaEquipePlataforma,
  revogarConviteEquipePlataforma,
} from "@/src/server/equipe-plataforma";
import { urlPublica } from "@/src/server/links";

export async function convidarEquipeAcao(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const convite = await convidarParaEquipePlataforma(usuario.id, { email: texto(formData, "email"), papel: texto(formData, "papel") });
    revalidatePath("/plataforma/equipe");
    const enviado = await enviarEmailConvite(
      emailConviteEquipePlataforma(convite.email, {
        papel: ROTULOS_PAPEL_PLATAFORMA[convite.papel],
        url: `${urlPublica()}/plataforma`,
        expiraEm: convite.expiraEm,
      }),
    );
    return enviado
      ? `Convite enviado para ${convite.email}`
      : `Convite criado, mas o e-mail não saiu: peça para ${convite.email} entrar com esse e-mail e abrir /plataforma`;
  }, { liberadaNaSuspensao: true });
}

export async function revogarConviteEquipeAcao(conviteId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await revogarConviteEquipePlataforma(usuario.id, conviteId);
    revalidatePath("/plataforma/equipe");
    return "Convite revogado";
  }, { liberadaNaSuspensao: true });
}

export async function definirPapelEquipeAcao(alvoId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await definirPapelPlataforma(usuario.id, alvoId, texto(formData, "papel"));
    revalidatePath("/plataforma", "layout");
    return "Papel atualizado";
  }, { liberadaNaSuspensao: true });
}

export async function removerDaEquipeAcao(alvoId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await removerDaEquipePlataforma(usuario.id, alvoId);
    revalidatePath("/plataforma", "layout");
    return "Removido da equipe";
  }, { liberadaNaSuspensao: true });
}

export async function aceitarConviteEquipeAcao(conviteId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const resultado = await executarAcao(async () => {
    await aceitarConviteEquipePlataforma(usuario.id, conviteId);
  }, { liberadaNaSuspensao: true });
  if (resultado.erro) return resultado;
  revalidatePath("/plataforma", "layout");
  redirect("/plataforma");
}
