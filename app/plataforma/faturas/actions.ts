"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { lerMoeda } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import {
  ajustarValorFatura,
  alterarVencimentoFatura,
  cancelarFaturaClinica,
  criarFaturaAvulsa,
  darBaixaManualFatura,
  reenviarFaturaClinica,
} from "@/src/server/plataforma-faturas";

// Operações numa fatura do SaaS pela equipe Salus (Dono e Financeiro): na ficha da clínica e
// no financeiro da plataforma.

function revalidar(tenantId: string) {
  revalidatePath(`/plataforma/clinicas/${tenantId}`);
  revalidatePath("/plataforma/financeiro");
}

export async function alterarVencimentoAcao(tenantId: string, faturaId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await alterarVencimentoFatura(usuario.id, tenantId, faturaId, { vencimento: texto(formData, "vencimento"), motivo: texto(formData, "motivo") });
    revalidar(tenantId);
    return "Vencimento alterado (o atraso e a suspensão já consideram a nova data)";
  }, { liberadaNaSuspensao: true });
}

export async function ajustarFaturaAcao(tenantId: string, faturaId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const valor = lerMoeda(texto(formData, "valor"));
    if (valor === null || valor === 0) throw new ErroNegocio("Informe o valor do ajuste");
    const sinal = texto(formData, "sentido") === "acrescimo" ? 1 : -1;
    const { valorCentavos } = await ajustarValorFatura(usuario.id, tenantId, faturaId, {
      valorCentavos: sinal * valor,
      descricao: texto(formData, "descricao"),
      motivo: texto(formData, "motivo"),
    });
    revalidar(tenantId);
    return valorCentavos === 0 ? "Fatura zerada: ficou isenta e quitada" : "Valor da fatura ajustado";
  }, { liberadaNaSuspensao: true });
}

export async function cancelarFaturaAcao(tenantId: string, faturaId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await cancelarFaturaClinica(usuario.id, tenantId, faturaId, texto(formData, "motivo"));
    revalidar(tenantId);
    return "Fatura cancelada";
  }, { liberadaNaSuspensao: true });
}

export async function baixaManualAcao(tenantId: string, faturaId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await darBaixaManualFatura(usuario.id, tenantId, faturaId, { pagoEm: texto(formData, "pagoEm"), observacao: texto(formData, "observacao") });
    revalidar(tenantId);
    return "Baixa registrada: fatura paga";
  }, { liberadaNaSuspensao: true });
}

export async function reenviarFaturaAcao(tenantId: string, faturaId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const r = await reenviarFaturaClinica(usuario.id, tenantId, faturaId);
    revalidar(tenantId);
    if (r.modo === "asaas") {
      if (r.erro) throw new ErroNegocio(`O Asaas recusou de novo: ${r.erro}`);
      return "Fatura enviada ao Asaas";
    }
    return r.enviados > 0 ? `Cobrança reenviada por e-mail (${r.enviados})` : "Nenhum e-mail saiu: confira o e-mail dos administradores";
  }, { liberadaNaSuspensao: true });
}

export async function faturaAvulsaAcao(tenantId: string, _e: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const descricoes = formData.getAll("itemDescricao").map(String);
    const valores = formData.getAll("itemValor").map(String);
    const itens = descricoes
      .map((descricao, i) => ({ descricao: descricao.trim(), bruto: (valores[i] ?? "").trim() }))
      .filter((it) => it.descricao || it.bruto)
      .map((it) => {
        const valorCentavos = lerMoeda(it.bruto);
        if (valorCentavos === null) throw new ErroNegocio(`Valor inválido em "${it.descricao || "item"}"`);
        return { descricao: it.descricao, valorCentavos };
      });
    const r = await criarFaturaAvulsa(usuario.id, tenantId, { itens, vencimento: texto(formData, "vencimento"), observacao: texto(formData, "observacao") });
    revalidar(tenantId);
    return r.enviada ? "Fatura avulsa criada e enviada" : `Fatura criada, mas o envio ao Asaas falhou (${r.erro}); use "Reenviar"`;
  }, { liberadaNaSuspensao: true });
}
