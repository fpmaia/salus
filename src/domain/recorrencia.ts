// Recorrência de reservas (semanal, quinzenal ou mensal). Domínio puro: sem I/O.
import { diaSemana, inicioDaSemana, somarDias, type DataLocal } from "./tempo";

/** Janela à frente em que as ocorrências ficam materializadas como reservas. */
export const JANELA_RECORRENCIA_SEMANAS = 8;

export const FREQUENCIAS = ["semanal", "quinzenal", "mensal"] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

export type RegraRecorrencia = {
  diaSemana: number;
  dataInicio: DataLocal;
  dataFim: DataLocal | null;
  /** Omitida = semanal. */
  frequencia?: Frequencia;
  /** Mensal: N-ª ocorrência do dia da semana no mês (1–4; 5 = a última). */
  semanaDoMes?: number | null;
};

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
// Segunda a sexta são femininos; sábado e domingo, masculinos.
const ORDINAIS = { f: ["1ª", "2ª", "3ª", "4ª", "última"], m: ["1º", "2º", "3º", "4º", "último"] } as const;

/**
 * Semana do mês de uma data (1–4), ou 5 = "a última" quando é a 5ª ocorrência (dias 29–31).
 * A 4ª ocorrência fica 4ª mesmo quando também é a última: ela existe em todo mês.
 */
export function semanaDoMesDe(data: DataLocal): number {
  return Math.ceil(Number(data.slice(8, 10)) / 7);
}

/** A N-ª ocorrência do dia da semana no mês `AAAA-MM` (5 = a última). */
function nesimoDiaDoMes(anoMes: string, dia: number, semana: number): DataLocal {
  const primeiro = `${anoMes}-01` as DataLocal;
  const primeiraOcorrencia = somarDias(primeiro, (dia - diaSemana(primeiro) + 7) % 7);
  if (semana < 5) return somarDias(primeiraOcorrencia, (semana - 1) * 7);
  let data = primeiraOcorrencia;
  while (somarDias(data, 7).slice(0, 7) === anoMes) data = somarDias(data, 7);
  return data;
}

function proximoMes(anoMes: string): string {
  const [a, m] = anoMes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** Datas da regra dentro de [de, ate] (inclusive), respeitando a vigência da regra. */
export function datasDaRecorrencia(regra: RegraRecorrencia, de: DataLocal, ate: DataLocal): DataLocal[] {
  const inicio = de > regra.dataInicio ? de : regra.dataInicio;
  const fim = regra.dataFim && regra.dataFim < ate ? regra.dataFim : ate;
  if (inicio > fim) return [];
  const datas: DataLocal[] = [];

  if (regra.frequencia === "mensal") {
    for (let mes = inicio.slice(0, 7); mes <= fim.slice(0, 7); mes = proximoMes(mes)) {
      const data = nesimoDiaDoMes(mes, regra.diaSemana, regra.semanaDoMes ?? 1);
      if (data >= inicio && data <= fim) datas.push(data);
    }
    return datas;
  }

  let data = somarDias(inicio, (regra.diaSemana - diaSemana(inicio) + 7) % 7);
  if (regra.frequencia === "quinzenal") {
    // Semanas pares contadas da semana em que a regra começa (independe de `de`).
    const ancora = inicioDaSemana(regra.dataInicio);
    const semanas = Math.round((Date.parse(inicioDaSemana(data)) - Date.parse(ancora)) / (7 * 86_400_000));
    if (semanas % 2 !== 0) data = somarDias(data, 7);
  }
  const passo = regra.frequencia === "quinzenal" ? 14 : 7;
  while (data <= fim) {
    datas.push(data);
    data = somarDias(data, passo);
  }
  return datas;
}

/** Última data coberta pela janela de materialização a partir de `hoje`. */
export function limiteDaJanela(hoje: DataLocal): DataLocal {
  return somarDias(hoje, JANELA_RECORRENCIA_SEMANAS * 7);
}

/** "toda segunda", "a cada 2 semanas, na quarta", "todo 1º sábado do mês"… */
export function descreverRecorrencia(regra: Pick<RegraRecorrencia, "diaSemana" | "frequencia" | "semanaDoMes">): string {
  const dia = NOMES_DIA[regra.diaSemana];
  const genero = regra.diaSemana === 0 || regra.diaSemana === 6 ? "m" : "f";
  const todo = genero === "m" ? "todo" : "toda";
  if (regra.frequencia === "mensal") return `${todo} ${ORDINAIS[genero][(regra.semanaDoMes ?? 1) - 1]} ${dia} do mês`;
  if (regra.frequencia === "quinzenal") return `a cada 2 semanas, ${genero === "m" ? "no" : "na"} ${dia}`;
  return `${todo} ${dia}`;
}
