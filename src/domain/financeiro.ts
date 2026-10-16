// Motor de cobrança: dado o acordo e o fato gerador, quais lançamentos devem existir.
// Domínio puro: sem I/O. A conciliação com o ledger fica em src/server/financeiro.ts.
import { aplicarBp, formatarMoeda, formatarPercentual } from "./dinheiro";
import { somarDias, type DataLocal } from "./tempo";

export const MODELOS = ["hora", "consulta", "percentual", "mensalidade"] as const;
export type ModeloCobranca = (typeof MODELOS)[number];
export type FluxoRecebimento = "centralizado" | "direto";
export type RegraFalta = "isenta" | "integral" | "percentual";
export type Natureza = "debito" | "credito";
export type TipoLancamento =
  | "locacao_hora"
  | "locacao_consulta"
  | "locacao_percentual"
  | "falta"
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
  mensalidade: "Mensalidade (pacote de horas)",
};

export const ROTULOS_TIPO: Record<TipoLancamento, string> = {
  locacao_hora: "Locação por hora",
  locacao_consulta: "Locação por consulta",
  locacao_percentual: "Locação percentual",
  falta: "Falta / cancelamento tardio",
  mensalidade: "Mensalidade",
  excedente_horas: "Horas excedentes",
  recebimento_paciente: "Recebido do paciente (repasse)",
  pagamento_profissional: "Pagamento do profissional",
  repasse_profissional: "Repasse ao profissional",
  ajuste: "Ajuste manual",
};

export type Acordo = {
  id: string;
  modelo: ModeloCobranca;
  fluxoRecebimento: FluxoRecebimento;
  valorHoraCentavos: number | null;
  valorConsultaCentavos: number | null;
  percentualBp: number | null;
  mensalidadeCentavos: number | null;
  horasIncluidas: number | null;
  regraFalta: RegraFalta;
  faltaPercentualBp: number | null;
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
};

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
  const base = (): number | null => {
    if (acordo.modelo === "consulta") return acordo.valorConsultaCentavos;
    if (acordo.modelo === "percentual" && acordo.percentualBp && valor !== null) return aplicarBp(valor, acordo.percentualBp);
    return null;
  };

  if (fato.status === "realizado") {
    const cobranca = base();
    if (cobranca && cobranca > 0) {
      desejados.push(
        acordo.modelo === "consulta"
          ? { tipo: "locacao_consulta", natureza: "debito", valorCentavos: cobranca, descricao: "Locação por consulta" }
          : {
              tipo: "locacao_percentual",
              natureza: "debito",
              valorCentavos: cobranca,
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

  const cobraFalta = fato.status === "falta" || (fato.status === "cancelado" && fato.cancelamentoTardio);
  if (cobraFalta && acordo.regraFalta !== "isenta") {
    const cheio = base();
    const cobranca =
      cheio === null ? null : acordo.regraFalta === "integral" ? cheio : aplicarBp(cheio, acordo.faltaPercentualBp ?? 0);
    if (cobranca && cobranca > 0) {
      desejados.push({
        tipo: "falta",
        natureza: "debito",
        valorCentavos: cobranca,
        descricao: fato.status === "falta" ? "Falta do paciente" : "Cancelamento tardio do paciente",
      });
    }
  }
  return desejados;
}

/** Mensalidade da competência + horas usadas além do pacote. */
export function lancamentosDaMensalidade(acordo: Acordo | null, minutosUsados: number): LancamentoDesejado[] {
  if (!acordo || acordo.modelo !== "mensalidade" || !acordo.mensalidadeCentavos) return [];
  const desejados: LancamentoDesejado[] = [
    {
      tipo: "mensalidade",
      natureza: "debito",
      valorCentavos: acordo.mensalidadeCentavos,
      descricao: `Mensalidade (${acordo.horasIncluidas ?? 0}h incluídas)`,
    },
  ];
  const excedente = minutosUsados - (acordo.horasIncluidas ?? 0) * 60;
  if (excedente > 0 && acordo.valorHoraCentavos) {
    desejados.push({
      tipo: "excedente_horas",
      natureza: "debito",
      valorCentavos: Math.round((excedente * acordo.valorHoraCentavos) / 60),
      descricao: `${horasTexto(excedente)} além do pacote × ${formatarMoeda(acordo.valorHoraCentavos)}/h`,
    });
  }
  return desejados;
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
