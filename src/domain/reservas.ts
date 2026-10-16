// Regras de reserva de sala. Domínio puro: sem I/O.
import {
  dataValida,
  diaSemana,
  horaDeMinutos,
  horaValida,
  instanteLocal,
  minutosDoDia,
  type DataLocal,
  type HoraLocal,
} from "./tempo";

export const SLOTS_PERMITIDOS = [15, 30, 60] as const;

export type HorarioFuncionamento = { diaSemana: number; abre: HoraLocal; fecha: HoraLocal };

export type ConfigUnidade = {
  timezone: string;
  slotMinutos: number;
  horarios: HorarioFuncionamento[];
  /** Datas locais sem funcionamento (feriados da unidade e do tenant). */
  feriados: DataLocal[];
};

export type JanelaLocal = { data: DataLocal; horaInicio: HoraLocal; horaFim: HoraLocal };

export type CodigoErroReserva =
  | "dados_invalidos"
  | "fora_do_slot"
  | "fora_do_horario"
  | "feriado"
  | "no_passado"
  | "conflito_sala"
  | "conflito_profissional"
  | "conflito_recorrencia"
  | "sala_inativa"
  | "profissional_inativo"
  | "nao_encontrada"
  | "nao_permitido";

export class ErroReserva extends Error {
  constructor(
    readonly codigo: CodigoErroReserva,
    message: string,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErroReserva";
  }
}

/** Intervalos de funcionamento do dia, em minutos, ordenados. Vazio = fechado. */
export function intervalosDoDia(config: ConfigUnidade, data: DataLocal): { abre: number; fecha: number }[] {
  if (config.feriados.includes(data)) return [];
  const dia = diaSemana(data);
  return config.horarios
    .filter((h) => h.diaSemana === dia)
    .map((h) => ({ abre: minutosDoDia(h.abre), fecha: minutosDoDia(h.fecha) }))
    .sort((a, b) => a.abre - b.abre);
}

/**
 * Valida a janela local e devolve o intervalo UTC [inicio, fim).
 * Checa formato, alinhamento ao slot, feriado, horário de funcionamento e passado.
 * Conflitos de sala/profissional ficam com o banco (EXCLUDE USING gist).
 */
export function validarJanela(
  janela: JanelaLocal,
  config: ConfigUnidade,
  agora: Date,
): { inicio: Date; fim: Date } {
  const { data, horaInicio, horaFim } = janela;
  if (!dataValida(data) || !horaValida(horaInicio) || !(horaValida(horaFim) || horaFim === "24:00")) {
    throw new ErroReserva("dados_invalidos", "Data ou horário inválido");
  }
  const ini = minutosDoDia(horaInicio);
  const fim = minutosDoDia(horaFim);
  if (fim <= ini) throw new ErroReserva("dados_invalidos", "O fim deve ser depois do início");

  const slot = config.slotMinutos;
  if (ini % slot !== 0 || fim % slot !== 0) {
    throw new ErroReserva("fora_do_slot", `Início e fim devem ser múltiplos de ${slot} minutos`);
  }
  if (config.feriados.includes(data)) {
    throw new ErroReserva("feriado", "A unidade não funciona nesta data (feriado)");
  }
  const cabe = intervalosDoDia(config, data).some((i) => i.abre <= ini && fim <= i.fecha);
  if (!cabe) {
    throw new ErroReserva("fora_do_horario", "Fora do horário de funcionamento da unidade");
  }

  const inicio = instanteLocal(data, horaInicio, config.timezone);
  if (inicio.getTime() < agora.getTime()) {
    throw new ErroReserva("no_passado", "Não é possível reservar um horário que já passou");
  }
  return { inicio, fim: instanteLocal(data, horaFim, config.timezone) };
}

/** Linhas da grade da agenda: do primeiro horário de abertura ao último fechamento, por slot. */
export function slotsDaGrade(config: ConfigUnidade, data: DataLocal): HoraLocal[] {
  const intervalos = intervalosDoDia(config, data);
  if (intervalos.length === 0) return [];
  const primeiro = Math.min(...intervalos.map((i) => i.abre));
  const ultimo = Math.max(...intervalos.map((i) => i.fecha));
  const slots: HoraLocal[] = [];
  for (let m = primeiro; m < ultimo; m += config.slotMinutos) slots.push(horaDeMinutos(m));
  return slots;
}

/** Um slot da grade está dentro de algum intervalo de funcionamento? */
export function slotAberto(config: ConfigUnidade, data: DataLocal, hora: HoraLocal): boolean {
  const m = minutosDoDia(hora);
  return intervalosDoDia(config, data).some((i) => i.abre <= m && m + config.slotMinutos <= i.fecha);
}
