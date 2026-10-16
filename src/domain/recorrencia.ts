// Recorrência semanal de reservas. Domínio puro: sem I/O.
import { diaSemana, somarDias, type DataLocal } from "./tempo";

/** Janela à frente em que as ocorrências ficam materializadas como reservas. */
export const JANELA_RECORRENCIA_SEMANAS = 8;

export type RegraSemanal = {
  diaSemana: number;
  dataInicio: DataLocal;
  dataFim: DataLocal | null;
};

/** Datas da regra dentro de [de, ate] (inclusive), respeitando a vigência da regra. */
export function datasDaRecorrencia(regra: RegraSemanal, de: DataLocal, ate: DataLocal): DataLocal[] {
  const inicio = de > regra.dataInicio ? de : regra.dataInicio;
  const fim = regra.dataFim && regra.dataFim < ate ? regra.dataFim : ate;
  if (inicio > fim) return [];

  let data = somarDias(inicio, (regra.diaSemana - diaSemana(inicio) + 7) % 7);
  const datas: DataLocal[] = [];
  while (data <= fim) {
    datas.push(data);
    data = somarDias(data, 7);
  }
  return datas;
}

/** Última data coberta pela janela de materialização a partir de `hoje`. */
export function limiteDaJanela(hoje: DataLocal): DataLocal {
  return somarDias(hoje, JANELA_RECORRENCIA_SEMANAS * 7);
}
