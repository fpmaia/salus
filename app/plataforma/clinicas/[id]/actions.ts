"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { lerMoeda } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import {
  criarDescontoClinica,
  lancarCreditoClinica,
  revogarCreditoClinica,
  revogarDescontoClinica,
  salvarCondicoesComerciais,
} from "@/src/server/plataforma-financeiro";

// Ações da aba Cobrança da ficha da clínica (equipe Salus: Dono e Financeiro).

/** Campo de dinheiro opcional: vazio = null (segue o plano); texto inválido = erro. */
function moedaOpcional(formData: FormData, campo: string, rotulo: string): number | null {
  const bruto = texto(formData, campo).trim();
  if (!bruto) return null;
  const valor = lerMoeda(bruto);
  if (valor === null) throw new ErroNegocio(`Valor inválido em "${rotulo}"`);
  return valor;
}

function inteiroOpcional(formData: FormData, campo: string, rotulo: string): number | null {
  const bruto = texto(formData, campo).trim();
  if (!bruto) return null;
  if (!/^\d+$/.test(bruto)) throw new ErroNegocio(`Número inválido em "${rotulo}"`);
  return Number(bruto);
}

function revalidar(tenantId: string) {
  revalidatePath(`/plataforma/clinicas/${tenantId}`);
  revalidatePath("/plataforma/financeiro");
}

export async function salvarCondicoesAcao(tenantId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await salvarCondicoesComerciais(usuario.id, tenantId, {
      precoMensalCentavos: moedaOpcional(formData, "precoMensal", "Mensalidade"),
      precoSalaExtraCentavos: moedaOpcional(formData, "precoSala", "Sala extra"),
      precoProfissionalExtraCentavos: moedaOpcional(formData, "precoProfissional", "Profissional extra"),
      precoUnidadeExtraCentavos: moedaOpcional(formData, "precoUnidade", "Unidade extra"),
      precoProntuarioCentavos: moedaOpcional(formData, "precoProntuario", "Prontuário"),
      diaVencimento: inteiroOpcional(formData, "diaVencimento", "Dia de vencimento"),
      diasCarencia: inteiroOpcional(formData, "diasCarencia", "Carência"),
      observacao: texto(formData, "observacao"),
    });
    revalidar(tenantId);
    return "Condições salvas: valem a partir da próxima fatura";
  }, { liberadaNaSuspensao: true });
}

export async function criarDescontoAcao(tenantId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const tipo = texto(formData, "tipo") === "valor" ? "valor" : "percentual";
    const valor = tipo === "valor" ? lerMoeda(texto(formData, "valor")) : Number(texto(formData, "valor").replace(",", "."));
    if (valor === null || !Number.isFinite(valor) || (tipo === "percentual" && !Number.isInteger(valor))) {
      throw new ErroNegocio(tipo === "valor" ? "Valor do desconto inválido" : "Percentual inteiro de 1 a 100");
    }
    const inicio = texto(formData, "inicio");
    const fim = texto(formData, "fim");
    await criarDescontoClinica(usuario.id, tenantId, {
      tipo,
      valor,
      inicio: inicio ? `${inicio}-01` : "",
      fim: fim ? `${fim}-01` : null,
      motivo: texto(formData, "motivo"),
    });
    revalidar(tenantId);
    return "Desconto criado";
  }, { liberadaNaSuspensao: true });
}

export async function revogarDescontoAcao(tenantId: string, descontoId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await revogarDescontoClinica(usuario.id, descontoId);
    revalidar(tenantId);
    return "Desconto revogado: não entra nas próximas faturas";
  }, { liberadaNaSuspensao: true });
}

export async function lancarCreditoAcao(tenantId: string, _estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const valor = lerMoeda(texto(formData, "valor"));
    if (valor === null) throw new ErroNegocio("Valor do crédito inválido");
    await lancarCreditoClinica(usuario.id, tenantId, { valorCentavos: valor, motivo: texto(formData, "motivo") });
    revalidar(tenantId);
    return "Crédito lançado: abate das próximas faturas";
  }, { liberadaNaSuspensao: true });
}

export async function revogarCreditoAcao(tenantId: string, creditoId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await revogarCreditoClinica(usuario.id, creditoId);
    revalidar(tenantId);
    return "Crédito revogado";
  }, { liberadaNaSuspensao: true });
}
