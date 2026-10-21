"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { atualizarPaciente, criarPaciente } from "@/src/server/pacientes";
import { anonimizarPaciente } from "@/src/server/titular";

function dadosPaciente(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    cpf: texto(formData, "cpf"),
    dataNascimento: texto(formData, "dataNascimento"),
    telefone: texto(formData, "telefone"),
    email: texto(formData, "email"),
    consentimentoLembretes: formData.get("consentimentoLembretes") === "on",
  };
}

export async function criarPacienteAcao(_estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await criarPaciente(ctx, dadosPaciente(formData));
    return "Paciente cadastrado";
  });
}

export async function atualizarPacienteAcao(pacienteId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    await atualizarPaciente(ctx, pacienteId, { ...dadosPaciente(formData), ativo: formData.get("ativo") === "on" });
    return "Paciente atualizado";
  });
}

export async function anonimizarPacienteAcao(pacienteId: string, _estado: EstadoAcao, formData: FormData) {
  return executarAcao(async () => {
    const ctx = await obterContextoTenant();
    const { atendimentos } = await anonimizarPaciente(ctx, pacienteId, { justificativa: texto(formData, "justificativa") });
    return `Paciente anonimizado. ${atendimentos} atendimento(s) mantido(s) no histórico, sem identificação.`;
  });
}
