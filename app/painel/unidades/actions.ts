"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { definirPoliticaCancelamento } from "@/src/server/configuracoes";
import {
  adicionarFeriado,
  atualizarSala,
  atualizarUnidade,
  criarSala,
  criarUnidade,
  definirHorarios,
  removerFeriado,
} from "@/src/server/unidades";

function dadosUnidade(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    endereco: texto(formData, "endereco"),
    timezone: texto(formData, "timezone") || "America/Sao_Paulo",
    slotMinutos: Number(texto(formData, "slotMinutos") || 30),
  };
}

function recursosDe(formData: FormData): string[] {
  return texto(formData, "recursos")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

export async function criarUnidadeAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await criarUnidade(ctx, dadosUnidade(formData));
    return "Unidade criada com horário padrão (seg–sex, 08h–18h)";
  });
}

export async function atualizarUnidadeAcao(unidadeId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await atualizarUnidade(ctx, unidadeId, { ...dadosUnidade(formData), ativo: formData.get("ativo") === "on" });
    return "Unidade atualizada";
  });
}

/** Até dois intervalos por dia: abre_{dia}_{n} / fecha_{dia}_{n}. Dia sem horário = fechado. */
export async function salvarHorariosAcao(unidadeId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const horarios = [];
    for (let dia = 0; dia < 7; dia++) {
      for (const n of [1, 2]) {
        const abre = texto(formData, `abre_${dia}_${n}`);
        const fecha = texto(formData, `fecha_${dia}_${n}`);
        if (abre && fecha) horarios.push({ diaSemana: dia, abre, fecha });
      }
    }
    await definirHorarios(ctx, unidadeId, horarios);
    return "Horários salvos";
  });
}

export async function adicionarFeriadoAcao(unidadeId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await adicionarFeriado(ctx, {
      unidadeId: formData.get("todasUnidades") === "on" ? null : unidadeId,
      data: texto(formData, "data"),
      descricao: texto(formData, "descricao"),
    });
    return "Feriado adicionado";
  });
}

export async function removerFeriadoAcao(feriadoId: string) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await removerFeriado(ctx, feriadoId);
    return "Feriado removido";
  });
}

// O preço da sala é do contrato de cada profissional (Contratos), não da sala.
function dadosSala(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    recursos: recursosDe(formData),
  };
}

export async function criarSalaAcao(unidadeId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await criarSala(ctx, unidadeId, dadosSala(formData));
    return "Sala criada";
  });
}

export async function atualizarSalaAcao(salaId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await atualizarSala(ctx, salaId, {
      ...dadosSala(formData),
      ativo: formData.get("ativo") === "on",
    });
    return "Sala atualizada";
  });
}

export async function definirPoliticaCancelamentoAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await definirPoliticaCancelamento(ctx, texto(formData, "horas"));
    return "Política de cancelamento salva";
  });
}
