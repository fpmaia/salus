// Motor de cobrança: dado o acordo e o fato gerador, quais lançamentos devem existir.
// Domínio puro: sem I/O. A conciliação com o ledger fica em src/server/financeiro.ts.
import { aplicarBp, formatarMoeda, formatarPercentual } from "./dinheiro";
import { somarDias, type DataLocal } from "./tempo";

export const MODELOS = ["hora", "consulta", "percentual", "mensalidade"] as const;
// "sala_fixa" só existe no enum do banco (legado, convertido em mensalidade sem limite na 0029).
export type ModeloCobranca = (typeof MODELOS)[number] | "sala_fixa";
/** Quem cancelou a consulta/reserva (o tardio pelo espaço não cobra o profissional). */
export type QuemCancelou = "paciente" | "profissional" | "espaco";
export type FluxoRecebimento = "centralizado" | "direto";
export type RegraFalta = "isenta" | "integral" | "percentual";
export type Natureza = "debito" | "credito";
export type TipoLancamento =
  | "locacao_hora"
  | "locacao_consulta"
  | "locacao_percentual"
  | "falta"
  | "multa_cancelamento"
  | "mensalidade"
  | "excedente_horas"
  | "recebimento_paciente"
  | "pagamento_profissional"
  | "repasse_profissional"
  | "ajuste";

export const ROTULOS_MODELO: Record<ModeloCobranca, string> = {
  hora: "Por hora reservada",
  consulta: "Valor fixo por consulta",
  percentual: "Percentual do atendimento",
  mensalidade: "Mensalidade (pacote de horas ou turno fixo)",
  sala_fixa: "Mensalidade (turno fixo)",
};

export const ROTULOS_TIPO: Record<TipoLancamento, string> = {
  locacao_hora: "Locação por hora",
  locacao_consulta: "Locação por consulta",
  locacao_percentual: "Locação percentual",
  falta: "Falta / cancelamento tardio",
  multa_cancelamento: "Cancelamento tardio de turno fixo",
  mensalidade: "Mensalidade",
  excedente_horas: "Horas excedentes",
  recebimento_paciente: "Recebido do paciente (repasse)",
  pagamento_profissional: "Pagamento do profissional",
  repasse_profissional: "Repasse ao profissional",
  ajuste: "Ajuste manual",
};

export type Acordo = {
  id: string;
  profissionalId?: string;
  salaId: string | null;
  modelo: ModeloCobranca;
  fluxoRecebimento: FluxoRecebimento;
  valorHoraCentavos: number | null;
  valorConsultaCentavos: number | null;
  percentualBp: number | null;
  mensalidadeCentavos: number | null;
  horasIncluidas: number | null;
  regraFalta: RegraFalta;
  faltaPercentualBp: number | null;
  prazoCancelamentoHoras?: number;
  multaCancelamentoReservaBp?: number | null;
  vigenteDe: DataLocal;
  vigenteAte: DataLocal | null;
};

/** Lançamento desejado para um fato gerador (sem identidade ainda). */
export type LancamentoDesejado = {
  tipo: TipoLancamento;
  natureza: Natureza;
  valorCentavos: number;
  descricao: string;
};

export function acordoVigente<T extends Pick<Acordo, "vigenteDe" | "vigenteAte">>(acordos: T[], data: DataLocal): T | null {
  return acordos.find((a) => a.vigenteDe <= data && (a.vigenteAte === null || data <= a.vigenteAte)) ?? null;
}

/** Primeiro dia do mês da data. */
export function competenciaDe(data: DataLocal): DataLocal {
  return `${data.slice(0, 7)}-01`;
}

export function proximaCompetencia(competencia: DataLocal): DataLocal {
  const [a, m] = competencia.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export function ultimoDiaDaCompetencia(competencia: DataLocal): DataLocal {
  return somarDias(proximaCompetencia(competencia), -1);
}

const horasTexto = (minutos: number) => `${(minutos / 60).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;

/** Reserva concluída: só o modelo por hora cobra a reserva em si. */
export function lancamentosDaReserva(acordo: Acordo | null, minutos: number): LancamentoDesejado[] {
  if (!acordo || acordo.modelo !== "hora" || !acordo.valorHoraCentavos) return [];
  const valor = Math.round((minutos * acordo.valorHoraCentavos) / 60);
  if (valor <= 0) return [];
  return [
    {
      tipo: "locacao_hora",
      natureza: "debito",
      valorCentavos: valor,
      descricao: `Locação ${horasTexto(minutos)} × ${formatarMoeda(acordo.valorHoraCentavos)}/h`,
    },
  ];
}

export type FatoAgendamento = {
  status: "agendado" | "confirmado" | "presente" | "realizado" | "falta" | "cancelado";
  cancelamentoTardio: boolean;
  valorCentavos: number | null;
  /** null: cancelamento anterior ao registro do autor (cobra como antes). */
  canceladoPor?: QuemCancelou | null;
};

/** Mensalidade sem limite de horas: turno fixo ou sala dedicada (antiga "sala fixa"). */
export function turnoFixo(acordo: Pick<Acordo, "modelo" | "horasIncluidas">): boolean {
  return (acordo.modelo === "mensalidade" && acordo.horasIncluidas === null) || acordo.modelo === "sala_fixa";
}

/**
 * Agendamento:
 * - realizado: locação por consulta ou percentual (se o valor foi informado);
 * - falta ou cancelamento tardio: cobra conforme a regra de falta (modelos consulta e percentual);
 * - caixa centralizado + realizado com valor: crédito do valor recebido do paciente (repasse).
 */
export function lancamentosDoAgendamento(acordo: Acordo | null, fato: FatoAgendamento): LancamentoDesejado[] {
  if (!acordo) return [];
  const desejados: LancamentoDesejado[] = [];
  const valor = fato.valorCentavos;

  // Base de cobrança por atendimento (null = modelo não cobra por atendimento ou falta o valor).
  const base = (): { valor: number; tipo: "consulta" | "percentual" } | null => {
    if (acordo.modelo === "consulta" && acordo.valorConsultaCentavos) {
      return { valor: acordo.valorConsultaCentavos, tipo: "consulta" };
    }
    if (acordo.modelo === "percentual" && acordo.percentualBp && valor !== null) {
      return { valor: aplicarBp(valor, acordo.percentualBp), tipo: "percentual" };
    }
    // Turno fixo pode cobrar também por atendimento (valor fixo ou percentual), se o contrato prevê.
    if (turnoFixo(acordo)) {
      if (acordo.valorConsultaCentavos && acordo.valorConsultaCentavos > 0) {
        return { valor: acordo.valorConsultaCentavos, tipo: "consulta" };
      }
      if (acordo.percentualBp && valor !== null) {
        return { valor: aplicarBp(valor, acordo.percentualBp), tipo: "percentual" };
      }
    }
    return null;
  };

  if (fato.status === "realizado") {
    const cobranca = base();
    if (cobranca && cobranca.valor > 0) {
      desejados.push(
        cobranca.tipo === "consulta"
          ? { tipo: "locacao_consulta", natureza: "debito", valorCentavos: cobranca.valor, descricao: "Locação por consulta" }
          : {
              tipo: "locacao_percentual",
              natureza: "debito",
              valorCentavos: cobranca.valor,
              descricao: `${formatarPercentual(acordo.percentualBp!)} de ${formatarMoeda(valor!)}`,
            },
      );
    }
    if (acordo.fluxoRecebimento === "centralizado" && valor !== null && valor > 0) {
      desejados.push({
        tipo: "recebimento_paciente",
        natureza: "credito",
        valorCentavos: valor,
        descricao: "Valor recebido do paciente pelo espaço",
      });
    }
  }

  // Tardio cobra se quem cancelou foi o paciente ou o profissional; se foi o espaço, não.
  const cobraFalta =
    fato.status === "falta" || (fato.status === "cancelado" && fato.cancelamentoTardio && fato.canceladoPor !== "espaco");
  if (cobraFalta && acordo.regraFalta !== "isenta") {
    const info = base();
    const cheio = info?.valor ?? null;
    const cobranca =
      cheio === null ? null : acordo.regraFalta === "integral" ? cheio : aplicarBp(cheio, acordo.faltaPercentualBp ?? 0);
    if (cobranca && cobranca > 0) {
      desejados.push({
        tipo: "falta",
        natureza: "debito",
        valorCentavos: cobranca,
        descricao:
          fato.status === "falta"
            ? "Falta do paciente"
            : fato.canceladoPor === "profissional"
              ? "Cancelamento tardio pelo profissional"
              : "Cancelamento tardio do paciente",
      });
    }
  }
  return desejados;
}

/** Minutos de reservas concluídas na competência; os da grade fixa do contrato à parte. */
export type UsoDoMes = { total: number; foraDaGrade: number };

/**
 * Mensalidade da competência:
 * - pacote de horas: mensalidade + horas além do pacote × valor da hora;
 * - turno fixo (sem limite): mensalidade cobre a grade do contrato; reservas fora dela são
 *   cobradas pela hora do contrato, se houver valor.
 */
export function lancamentosDaMensalidade(acordo: Acordo | null, uso: UsoDoMes | number): LancamentoDesejado[] {
  if (!acordo || !acordo.mensalidadeCentavos) return [];
  if (acordo.modelo !== "mensalidade" && acordo.modelo !== "sala_fixa") return [];
  const { total, foraDaGrade } = typeof uso === "number" ? { total: uso, foraDaGrade: 0 } : uso;
  const fixo = turnoFixo(acordo);
  const desejados: LancamentoDesejado[] = [
    {
      tipo: "mensalidade",
      natureza: "debito",
      valorCentavos: acordo.mensalidadeCentavos,
      descricao: fixo ? "Mensalidade (turno fixo)" : `Mensalidade (${acordo.horasIncluidas ?? 0}h incluídas)`,
    },
  ];
  const excedente = fixo ? foraDaGrade : total - (acordo.horasIncluidas ?? 0) * 60;
  if (excedente > 0 && acordo.valorHoraCentavos) {
    desejados.push({
      tipo: "excedente_horas",
      natureza: "debito",
      valorCentavos: Math.round((excedente * acordo.valorHoraCentavos) / 60),
      descricao: `${horasTexto(excedente)} ${fixo ? "fora do turno fixo" : "além do pacote"} × ${formatarMoeda(acordo.valorHoraCentavos)}/h`,
    });
  }
  return desejados;
}

export type FatoReservaCancelada = {
  minutos: number;
  /** Cancelada dentro do prazo do contrato (prazoCancelamentoHoras). */
  tardia: boolean;
  canceladaPor: "profissional" | "espaco" | null;
  /** A reserva é uma data da grade fixa deste contrato. */
  daGradeDoContrato: boolean;
};

/**
 * Turno fixo por hora: o profissional que cancela tarde uma data da grade paga o percentual
 * do contrato sobre as horas daquela data. Avulsa, fora do prazo ou cancelada pelo espaço: nada.
 */
export function lancamentosDaReservaCancelada(acordo: Acordo | null, fato: FatoReservaCancelada): LancamentoDesejado[] {
  if (!acordo || acordo.modelo !== "hora" || !acordo.valorHoraCentavos || !acordo.multaCancelamentoReservaBp) return [];
  if (!fato.daGradeDoContrato || !fato.tardia || fato.canceladaPor !== "profissional") return [];
  const cheio = Math.round((fato.minutos * acordo.valorHoraCentavos) / 60);
  const valor = aplicarBp(cheio, acordo.multaCancelamentoReservaBp);
  if (valor <= 0) return [];
  return [
    {
      tipo: "multa_cancelamento",
      natureza: "debito",
      valorCentavos: valor,
      descricao: `Cancelamento tardio do turno fixo: ${formatarPercentual(acordo.multaCancelamentoReservaBp)} de ${horasTexto(fato.minutos)}`,
    },
  ];
}

/** Saldo do profissional: positivo = deve ao espaço; negativo = tem a receber. */
export function saldo(lancamentos: { natureza: Natureza; valorCentavos: number }[]): number {
  return lancamentos.reduce((acc, l) => acc + (l.natureza === "debito" ? l.valorCentavos : -l.valorCentavos), 0);
}

export type LancamentoExistente = LancamentoDesejado & { id: string };

/**
 * Conciliação: compara o que deve existir (desejados) com os lançamentos ativos (não
 * estornados) da mesma origem. Mantém os iguais, estorna os que sobram e cria os que faltam.
 * Rodar duas vezes com os mesmos dados não muda nada (idempotente).
 */
export function conciliar(
  desejados: LancamentoDesejado[],
  ativos: LancamentoExistente[],
): { estornar: LancamentoExistente[]; criar: LancamentoDesejado[] } {
  const restantes = [...ativos];
  const criar: LancamentoDesejado[] = [];
  for (const d of desejados) {
    const i = restantes.findIndex((a) => a.tipo === d.tipo && a.natureza === d.natureza && a.valorCentavos === d.valorCentavos);
    if (i >= 0) restantes.splice(i, 1);
    else criar.push(d);
  }
  return { estornar: restantes, criar };
}
