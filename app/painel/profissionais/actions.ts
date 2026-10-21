"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { decisaoReservas, sufixoCanceladas, type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { enviarEmailConvite } from "@/src/server/convites-email";
import { emailConviteProfissional } from "@/src/server/email-modelos";
import { atualizarProfissional, criarProfissional, gerarConvite } from "@/src/server/profissionais";
import { urlPublica } from "@/src/server/url-publica";

function dadosProfissional(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    email: texto(formData, "email"),
    telefone: texto(formData, "telefone"),
    conselho: texto(formData, "conselho") as never,
    registro: texto(formData, "registro"),
    especialidade: texto(formData, "especialidade"),
    documento: texto(formData, "documento"),
  };
}

export async function criarProfissionalAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await criarProfissional(ctx, dadosProfissional(formData));
    return "Profissional cadastrado. Gere o convite para dar acesso.";
  });
}

export async function atualizarProfissionalAcao(profissionalId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { canceladas } = await atualizarProfissional(ctx, profissionalId, {
      ...dadosProfissional(formData),
      ativo: formData.get("ativo") === "on",
      decisaoReservas: decisaoReservas(formData),
    });
    return `Profissional atualizado.${sufixoCanceladas(canceladas)}`;
  });
}

export async function gerarConviteAcao(profissionalId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { token, expiraEm, email, nome } = await gerarConvite(ctx, profissionalId);
    const link = `${await urlPublica()}/convite/${token}`;
    const enviado = await enviarEmailConvite(emailConviteProfissional(email, { nomeProfissional: nome, espaco: ctx.tenantNome, url: link, expiraEm }));
    const validade = expiraEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    return {
      erro: null,
      sucesso: enviado
        ? `Convite enviado para ${email}. O link abaixo vale até ${validade} e só é exibido agora.`
        : `Não foi possível enviar o e-mail; copie o link abaixo (válido até ${validade}) e envie ao profissional.`,
      dados: { link },
    };
  });
}
