"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { criarConviteClinica, definirFimDoTeste, revogarConviteClinica } from "@/src/server/convites-clinica";
import { enviarEmailConvite } from "@/src/server/convites-email";
import { emailConviteClinica } from "@/src/server/email-modelos";
import { urlPublica } from "@/src/server/links";
import { listarPlanosDisponiveis } from "@/src/server/plataforma";

export async function criarConviteClinicaAcao(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const email = texto(formData, "email").trim().toLowerCase();
    const planoId = texto(formData, "planoId");
    const diasTeste = texto(formData, "diasTeste");
    const resultado = await criarConviteClinica(usuario.id, {
      email,
      planoId,
      diasTeste,
      validadeDias: texto(formData, "validadeDias") || undefined,
      observacao: texto(formData, "observacao"),
      cupom: texto(formData, "cupom"),
    });
    revalidatePath("/plataforma/convites");
    const plano = (await listarPlanosDisponiveis(usuario.id)).find((p) => p.id === planoId);
    const enviado = await enviarEmailConvite(
      emailConviteClinica(email, {
        plano: plano?.nome ?? "",
        dias: Number(diasTeste),
        url: `${urlPublica()}${resultado.link}`,
        expiraEm: resultado.expiraEm,
      }),
    );
    return {
      erro: null,
      sucesso: enviado
        ? `Convite enviado para ${email}. Se preferir, copie o link abaixo.`
        : `Não foi possível enviar o e-mail para ${email}; copie o link abaixo e envie você mesmo.`,
      dados: { link: resultado.link },
    };
  }, { liberadaNaSuspensao: true });
}

export async function revogarConviteClinicaAcao(conviteId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await revogarConviteClinica(usuario.id, conviteId);
    revalidatePath("/plataforma/convites");
    return "Convite revogado";
  }, { liberadaNaSuspensao: true });
}

export async function definirFimDoTesteAcao(tenantId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const encerrar = formData.get("encerrar") === "on";
    await definirFimDoTeste(usuario.id, tenantId, encerrar ? null : texto(formData, "testeAte"));
    revalidatePath(`/plataforma/clinicas/${tenantId}`);
    return encerrar ? "Teste encerrado: a cobrança volta a partir do mês atual" : "Fim do teste atualizado";
  }, { liberadaNaSuspensao: true });
}
