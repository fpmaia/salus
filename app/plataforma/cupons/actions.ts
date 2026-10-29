"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/src/auth/sessao";
import { lerMoeda } from "@/src/domain/dinheiro";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { ErroNegocio } from "@/src/server/erros";
import { alternarCupom, salvarCupom } from "@/src/server/plataforma-financeiro";

function inteiroOuNull(formData: FormData, campo: string, rotulo: string): number | null {
  const bruto = texto(formData, campo).trim();
  if (!bruto) return null;
  if (!/^\d+$/.test(bruto)) throw new ErroNegocio(`Número inválido em "${rotulo}"`);
  return Number(bruto);
}

export async function criarCupomAcao(_estado: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    const tipo = texto(formData, "tipo") === "valor" ? "valor" : "percentual";
    const valor = tipo === "valor" ? lerMoeda(texto(formData, "valor")) : inteiroOuNull(formData, "valor", "Percentual");
    if (valor === null) throw new ErroNegocio("Informe o valor do desconto");
    await salvarCupom(usuario.id, null, {
      codigo: texto(formData, "codigo"),
      descricao: texto(formData, "descricao"),
      tipo,
      valor,
      duracaoMeses: inteiroOuNull(formData, "duracaoMeses", "Duração"),
      validoAte: texto(formData, "validoAte") || null,
      maxUsos: inteiroOuNull(formData, "maxUsos", "Limite de usos"),
      planosIds: formData.getAll("planosIds").map(String),
    });
    revalidatePath("/plataforma/cupons");
    return "Cupom criado";
  }, { liberadaNaSuspensao: true });
}

export async function alternarCupomAcao(cupomId: string, ativo: boolean): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  return executarAcao(async () => {
    await alternarCupom(usuario.id, cupomId, ativo);
    revalidatePath("/plataforma/cupons");
    return ativo ? "Cupom reativado" : "Cupom desativado: não aceita novos usos";
  }, { liberadaNaSuspensao: true });
}
