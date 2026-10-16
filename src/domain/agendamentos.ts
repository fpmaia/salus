// Fluxo de status do agendamento e política de cancelamento. Domínio puro: sem I/O.

export const STATUS_AGENDAMENTO = ["agendado", "confirmado", "presente", "realizado", "falta", "cancelado"] as const;
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number];

export const ROTULOS_STATUS: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  presente: "Presente",
  realizado: "Realizado",
  falta: "Falta",
  cancelado: "Cancelado",
};

/** Status que ainda ocupam o horário e impedem cancelar a reserva. */
export const STATUS_ATIVOS: readonly StatusAgendamento[] = ["agendado", "confirmado", "presente"];

// agendado → confirmado → presente → realizado; falta e cancelado saem dos estados ativos.
const TRANSICOES: Record<StatusAgendamento, readonly StatusAgendamento[]> = {
  agendado: ["confirmado", "presente", "falta", "cancelado"],
  confirmado: ["presente", "falta", "cancelado"],
  presente: ["realizado"],
  realizado: [],
  falta: [],
  cancelado: [],
};

/** Check-in liberado a partir desta antecedência do início. */
export const CHECKIN_ANTECEDENCIA_MIN = 60;

export type CodigoErroAgendamento =
  | "dados_invalidos"
  | "transicao_invalida"
  | "cedo_demais"
  | "ja_comecou"
  | "no_passado"
  | "conflito_profissional"
  | "conflito_paciente"
  | "fora_da_reserva"
  | "sala_ocupada"
  | "nao_encontrado"
  | "nao_permitido";

export class ErroAgendamento extends Error {
  constructor(
    readonly codigo: CodigoErroAgendamento,
    message: string,
  ) {
    super(message);
    this.name = "ErroAgendamento";
  }
}

export function transicoesPossiveis(de: StatusAgendamento): readonly StatusAgendamento[] {
  return TRANSICOES[de];
}

/**
 * Valida a mudança de status no tempo:
 * - presente: a partir de 1h antes do início;
 * - realizado/falta: só depois do início;
 * - cancelado: só antes do início (depois disso, é falta).
 */
export function validarTransicao(
  de: StatusAgendamento,
  para: StatusAgendamento,
  periodo: { inicio: Date; fim: Date },
  agora: Date,
): void {
  if (!TRANSICOES[de].includes(para)) {
    throw new ErroAgendamento("transicao_invalida", `Não é possível mudar de "${ROTULOS_STATUS[de]}" para "${ROTULOS_STATUS[para]}"`);
  }
  const t = agora.getTime();
  const inicio = periodo.inicio.getTime();
  if (para === "presente" && t < inicio - CHECKIN_ANTECEDENCIA_MIN * 60_000) {
    throw new ErroAgendamento("cedo_demais", "O check-in abre 1 hora antes do horário");
  }
  if ((para === "realizado" || para === "falta") && t < inicio) {
    throw new ErroAgendamento("cedo_demais", "Só é possível registrar depois do início do atendimento");
  }
  if (para === "cancelado" && t >= inicio) {
    throw new ErroAgendamento("ja_comecou", "O horário já começou: registre falta em vez de cancelar");
  }
}

/** Cancelamento com menos antecedência que a política do tenant. */
export function cancelamentoTardio(inicio: Date, agora: Date, antecedenciaHoras: number): boolean {
  return inicio.getTime() - agora.getTime() < antecedenciaHoras * 3_600_000;
}
