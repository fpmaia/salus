"use server";

import type { EstadoAcao } from "@/src/server/acao";
import { texto } from "@/src/server/acao";
import { agendarOnline } from "@/src/server/agendamento-online";
import { mensagemDeErro } from "@/src/server/erros";

// Ação pública (sem login): a página só conhece o slug; o serviço revalida tudo.
export async function agendarOnlineAcao(slug: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  try {
    const r = await agendarOnline(slug, {
      inicio: texto(formData, "inicio"),
      nome: texto(formData, "nome"),
      telefone: texto(formData, "telefone"),
      email: texto(formData, "email"),
      cpf: texto(formData, "cpf"),
      consentimentoLembretes: formData.get("consentimentoLembretes") === "on",
      aceitePrivacidade: (formData.get("aceitePrivacidade") === "on") as true,
      site: texto(formData, "site"),
    });
    return {
      erro: null,
      sucesso: `Pronto, ${r.paciente}! Atendimento com ${r.profissional} em ${r.data} às ${r.hora} (${r.local}).`,
      dados: { link: r.link },
    };
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem, sucesso: null };
    throw erro;
  }
}
