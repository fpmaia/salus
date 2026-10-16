"use server";

import { headers } from "next/headers";
import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { atualizarProfissional, criarProfissional, gerarConvite } from "@/src/server/profissionais";

function dadosProfissional(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    email: texto(formData, "email"),
    telefone: texto(formData, "telefone"),
    conselho: texto(formData, "conselho") as never,
    registro: texto(formData, "registro"),
    especialidade: texto(formData, "especialidade"),
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
    await atualizarProfissional(ctx, profissionalId, {
      ...dadosProfissional(formData),
      ativo: formData.get("ativo") === "on",
    });
    return "Profissional atualizado";
  });
}

/** Base pública do app para montar o link (BETTER_AUTH_URL ou o host da requisição). */
async function urlBase(): Promise<string> {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export async function gerarConviteAcao(profissionalId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { token, expiraEm } = await gerarConvite(ctx, profissionalId);
    return {
      erro: null,
      sucesso: `Link válido até ${expiraEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Ele só é exibido agora.`,
      dados: { link: `${await urlBase()}/convite/${token}` },
    };
  });
}
