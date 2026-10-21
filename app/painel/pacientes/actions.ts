"use server";

import { obterContextoTenant } from "@/src/auth/sessao";
import { type EstadoAcao, executarAcao, texto } from "@/src/server/acao";
import { unstable_rethrow } from "next/navigation";
import { mensagemDeErro } from "@/src/server/erros";
import { atualizarPaciente, buscarPacientes, criarPaciente } from "@/src/server/pacientes";
import { formatarDataBr } from "@/src/server/reservas";
import { anonimizarPaciente } from "@/src/server/titular";

function dadosPaciente(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    cpf: texto(formData, "cpf"),
    dataNascimento: texto(formData, "dataNascimento"),
    telefone: texto(formData, "telefone"),
    email: texto(formData, "email"),
    responsavelNome: texto(formData, "responsavelNome"),
    responsavelCpf: texto(formData, "responsavelCpf"),
    responsavelParentesco: texto(formData, "responsavelParentesco"),
    convenioNome: texto(formData, "convenioNome"),
    convenioCarteirinha: texto(formData, "convenioCarteirinha"),
    cep: texto(formData, "cep"),
    endereco: texto(formData, "endereco"),
    bairro: texto(formData, "bairro"),
    cidade: texto(formData, "cidade"),
    uf: texto(formData, "uf"),
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

export type PacienteEncontrado = { id: string; nome: string; detalhe: string };

/** Busca para o seletor de paciente (até 8 resultados). */
export async function buscarPacientesAcao(termo: string): Promise<PacienteEncontrado[]> {
  const ctx = await obterContextoTenant();
  const { itens } = await buscarPacientes(ctx, { busca: termo.slice(0, 80), porPagina: 8 });
  return itens.map((p) => ({ id: p.id, nome: p.nome, detalhe: [p.telefone, p.dataNascimento && `nasc. ${formatarDataBr(p.dataNascimento)}`].filter(Boolean).join(" · ") }));
}

/** Cadastro rápido (nome e telefone) direto do agendamento. */
export async function cadastroRapidoPacienteAcao(
  nome: string,
  telefone: string,
): Promise<{ ok: true; paciente: PacienteEncontrado } | { ok: false; erro: string }> {
  try {
    const ctx = await obterContextoTenant();
    const { id } = await criarPaciente(ctx, { nome, telefone });
    return { ok: true, paciente: { id, nome: nome.trim(), detalhe: telefone.trim() } };
  } catch (erro) {
    unstable_rethrow(erro);
    const mensagem = mensagemDeErro(erro);
    if (!mensagem) throw erro;
    return { ok: false, erro: mensagem };
  }
}
