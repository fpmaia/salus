"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import {
  excluirModelo,
  restaurarPapelTimbrado,
  salvarModelo,
  salvarPapelTimbrado,
  type Escopo,
} from "@/src/server/documentos-personalizados";

function dadosModelo(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    titulo: texto(formData, "titulo"),
    anotacoes: texto(formData, "anotacoes"),
    prescricao: texto(formData, "prescricao"),
  };
}

export async function salvarModeloAcao(escopo: Escopo, id: string | null, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await salvarModelo(ctx, escopo, id, dadosModelo(formData));
    return id ? "Modelo atualizado" : "Modelo criado";
  });
}

export async function excluirModeloAcao(escopo: Escopo, id: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await excluirModelo(ctx, escopo, id);
    return "Modelo excluído";
  });
}

/** "Salvar como modelo" no editor do prontuário: vira um modelo pessoal do profissional. */
export async function salvarComoModeloAcao(dados: {
  nome: string;
  titulo: string;
  anotacoes: string;
  prescricao: string;
}): Promise<EstadoAcao> {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await salvarModelo(ctx, "meu", null, dados);
    return `Modelo "${dados.nome.trim()}" salvo em Meus modelos`;
  });
}

export async function salvarPapelTimbradoAcao(escopo: Escopo, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const arquivo = formData.get("logo");
    const logo = arquivo instanceof File && arquivo.size > 0 ? new Uint8Array(await arquivo.arrayBuffer()) : undefined;
    await salvarPapelTimbrado(ctx, escopo, {
      cabecalho: texto(formData, "cabecalho"),
      rodape: texto(formData, "rodape"),
      alinhamento: texto(formData, "alinhamento") === "esquerda" ? "esquerda" : "centro",
      mostrarLogo: formData.get("mostrarLogo") === "on",
      removerLogo: formData.get("removerLogo") === "on",
      logo,
    });
    return "Papel timbrado salvo";
  });
}

export async function restaurarPapelTimbradoAcao(escopo: Escopo) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await restaurarPapelTimbrado(ctx, escopo);
    return "Papel timbrado restaurado para o padrão";
  });
}
