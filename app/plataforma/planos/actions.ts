"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { mensagemDeErro } from "@/src/server/erros";
import { atualizarConfiguracaoPlano } from "@/src/server/plataforma";

/** "199,90" ou "199.90" → 19990; vazio ou inválido → NaN (o schema recusa). */
function centavos(formData: FormData, campo: string): number {
  const bruto = String(formData.get(campo) ?? "").trim().replace(/\s|R\$/g, "");
  if (!bruto) return Number.NaN;
  const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  return /^\d+(\.\d{1,2})?$/.test(normalizado) ? Math.round(Number(normalizado) * 100) : Number.NaN;
}

function inteiro(formData: FormData, campo: string): number {
  const bruto = String(formData.get(campo) ?? "").trim();
  return /^\d+$/.test(bruto) ? Number(bruto) : Number.NaN;
}

export async function atualizarPlanoPlataformaAcao(
  _estadoAnterior: unknown,
  formData: FormData,
): Promise<{ erro?: string; sucesso?: string }> {
  const usuario = await exigirUsuario();
  const nome = String(formData.get("nome") ?? "");
  try {
    await atualizarConfiguracaoPlano(usuario.id, String(formData.get("planoId") ?? ""), {
      nome,
      precoMensalCentavos: centavos(formData, "precoMensal"),
      precoSalaExtraCentavos: centavos(formData, "precoSalaExtra"),
      precoProfissionalExtraCentavos: centavos(formData, "precoProfissionalExtra"),
      precoUnidadeExtraCentavos: centavos(formData, "precoUnidadeExtra"),
      precoProntuarioCentavos: centavos(formData, "precoProntuario"),
      permiteUnidadeExtra: formData.get("permiteUnidadeExtra") === "true",
      limites: {
        salas: inteiro(formData, "limiteSalas"),
        profissionais: inteiro(formData, "limiteProfissionais"),
        unidades: inteiro(formData, "limiteUnidades"),
      },
    });
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return { erro: mensagem };
    throw erro;
  }
  revalidatePath("/plataforma/planos");
  revalidatePath("/painel/assinatura");
  return { sucesso: `Plano "${nome}" atualizado.` };
}
