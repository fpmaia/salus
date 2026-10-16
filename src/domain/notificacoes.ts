// Regras de notificação (telefone, janela de lembrete, retentativas). Domínio puro: sem I/O.

/** Lembrete D-1: enviado quando o compromisso começa entre 2h e 24h a partir de agora. */
export const LEMBRETE_ANTECEDENCIA_MAX_H = 24;
export const LEMBRETE_ANTECEDENCIA_MIN_H = 2;

export const MAX_TENTATIVAS = 5;

/** Espera antes da próxima tentativa: 1, 2, 4, 8… minutos (máx. 1h). */
export function atrasoRetentativaMs(tentativas: number): number {
  return Math.min(60, 2 ** Math.max(0, tentativas - 1)) * 60_000;
}

/**
 * Telefone brasileiro → E.164 (+55DDDNÚMERO). Aceita máscara, com ou sem 55.
 * Retorna null se não parecer um celular/fixo válido (10 ou 11 dígitos após o DDI).
 */
export function normalizarTelefoneBr(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  let digitos = telefone.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (digitos.startsWith("0")) return null;
  return `+55${digitos}`;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export type ParametrosLembreteAgendamento = {
  paciente: string;
  data: string;
  hora: string;
  profissional: string;
  local: string;
  link: string;
};

export type ParametrosLembreteReserva = {
  profissional: string;
  data: string;
  hora: string;
  sala: string;
  local: string;
};

/** Texto equivalente ao template aprovado (usado pelo provider de console e na tela da outbox). */
export function textoDaMensagem(tipo: "lembrete_agendamento" | "lembrete_reserva", p: Record<string, string>): string {
  if (tipo === "lembrete_agendamento") {
    return `Olá, ${p.paciente}! Lembrete: seu atendimento com ${p.profissional} é em ${p.data} às ${p.hora} (${p.local}). Confirme ou cancele: ${p.link}`;
  }
  return `Olá, ${p.profissional}! Lembrete da sua reserva: ${p.sala} em ${p.data} às ${p.hora} (${p.local}).`;
}
