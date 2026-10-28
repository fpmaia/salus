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

export type HorarioVago = {
  inicio: HoraLocal;
  fim: HoraLocal;
  duracaoMinutos: number;
};

/**
 * Calcula intervalos vagos (livres) dentro de uma reserva a partir dos intervalos ocupados
 * por agendamentos já marcados.
 */
export function calcularHorariosVagos(
  reserva: { horaInicio: HoraLocal; horaFim: HoraLocal },
  ocupados: Array<{ horaInicio: HoraLocal; horaFim: HoraLocal }>,
): HorarioVago[] {
  const inicioReserva = minutosDoDia(reserva.horaInicio);
  const fimReserva = minutosDoDia(reserva.horaFim);
  if (fimReserva <= inicioReserva) return [];

  const intervalosOcupados = ocupados
    .map((o) => ({
      inicio: Math.max(inicioReserva, minutosDoDia(o.horaInicio)),
      fim: Math.min(fimReserva, minutosDoDia(o.horaFim)),
    }))
    .filter((o) => o.fim > o.inicio)
    .sort((a, b) => a.inicio - b.inicio);

  const unidos: Array<{ inicio: number; fim: number }> = [];
  for (const intervalo of intervalosOcupados) {
    const anterior = unidos[unidos.length - 1];
    if (anterior && intervalo.inicio <= anterior.fim) {
      anterior.fim = Math.max(anterior.fim, intervalo.fim);
    } else {
      unidos.push({ inicio: intervalo.inicio, fim: intervalo.fim });
    }
  }

  const vagos: HorarioVago[] = [];
  let ponteiro = inicioReserva;

  for (const ocupado of unidos) {
    if (ocupado.inicio > ponteiro) {
      vagos.push({
        inicio: horaDeMinutos(ponteiro),
        fim: horaDeMinutos(ocupado.inicio),
        duracaoMinutos: ocupado.inicio - ponteiro,
      });
    }
    ponteiro = Math.max(ponteiro, ocupado.fim);
  }

  if (ponteiro < fimReserva) {
    vagos.push({
      inicio: horaDeMinutos(ponteiro),
      fim: horaDeMinutos(fimReserva),
      duracaoMinutos: fimReserva - ponteiro,
    });
  }

  return vagos;
}

export type SegmentoReserva = {
  chave: string;
  tipo: "ocupado" | "vago";
  horaInicio: HoraLocal;
  horaFim: HoraLocal;
  pacienteNome?: string;
  statusAtendimento?: string;
  atendimentoId?: string;
};

/**
 * Segmenta uma reserva em blocos de horários ocupados (com pacientes) e vagos (sem paciente),
 * permitindo que a agenda reflita com fidelidade os horários já agendados e os ainda disponíveis.
 */
export function segmentarReserva(
  reserva: {
    id: string;
    horaInicio: HoraLocal;
    horaFim: HoraLocal;
    pacientes?: number;
    pacientesNomes?: string[];
    atendimentos?: Array<{
      id: string;
      pacienteNome: string;
      horaInicio: HoraLocal;
      horaFim: HoraLocal;
      status: string;
    }>;
  },
): SegmentoReserva[] {
  const inicioReserva = minutosDoDia(reserva.horaInicio);
  const fimReserva = minutosDoDia(reserva.horaFim);
  if (fimReserva <= inicioReserva) return [];

  if (!reserva.atendimentos || reserva.atendimentos.length === 0) {
    return [
      {
        chave: `${reserva.id}-vago-${reserva.horaInicio}-${reserva.horaFim}`,
        tipo: (reserva.pacientes ?? 0) > 0 ? "ocupado" : "vago",
        horaInicio: reserva.horaInicio,
        horaFim: reserva.horaFim,
        pacienteNome: reserva.pacientesNomes?.[0],
      },
    ];
  }

  const atendsValidos = reserva.atendimentos
    .map((at) => ({
      at,
      iniMin: Math.max(inicioReserva, minutosDoDia(at.horaInicio)),
      fimMin: Math.min(fimReserva, minutosDoDia(at.horaFim)),
    }))
    .filter((item) => item.fimMin > item.iniMin)
    .sort((a, b) => a.iniMin - b.iniMin);

  const segmentos: SegmentoReserva[] = [];
  let ponteiro = inicioReserva;

  for (const item of atendsValidos) {
    if (item.iniMin > ponteiro) {
      segmentos.push({
        chave: `${reserva.id}-vago-${ponteiro}-${item.iniMin}`,
        tipo: "vago",
        horaInicio: horaDeMinutos(ponteiro),
        horaFim: horaDeMinutos(item.iniMin),
      });
      ponteiro = item.iniMin;
    }

    if (item.fimMin > ponteiro) {
      segmentos.push({
        chave: `${reserva.id}-ocupado-${item.iniMin}-${item.fimMin}-${item.at.id}`,
        tipo: "ocupado",
        horaInicio: horaDeMinutos(item.iniMin),
        horaFim: horaDeMinutos(item.fimMin),
        pacienteNome: item.at.pacienteNome,
        statusAtendimento: item.at.status,
        atendimentoId: item.at.id,
      });
      ponteiro = item.fimMin;
    }
  }

  if (ponteiro < fimReserva) {
    segmentos.push({
      chave: `${reserva.id}-vago-${ponteiro}-${fimReserva}`,
      tipo: "vago",
      horaInicio: horaDeMinutos(ponteiro),
      horaFim: horaDeMinutos(fimReserva),
    });
  }

  return segmentos;
}

export type AtendimentoNaReserva = {
  id: string;
  pacienteNome: string;
  horaInicio: string;
  horaFim: string;
  status: string;
};

export type ReservaNaAgenda = {
  id: string;
  salaId: string;
  data: DataLocal;
  horaInicio: string;
  horaFim: string;
  status: "ativa" | "concluida" | "cancelada";
  /** null quando o usuário (profissional) não pode ver de quem é a reserva. */
  profissionalNome: string | null;
  profissionalId: string | null;
  propria: boolean;
  recorrenciaId: string | null;
  ehSalaFixa: boolean;
  contratoCodigo: string | null;
  contratoId: string | null;
  /** Pacientes com agendamento ativo/realizado na reserva (só para quem vê a reserva). */
  pacientes: number;
  pacientesNomes: string[];
  atendimentos: AtendimentoNaReserva[];
};


