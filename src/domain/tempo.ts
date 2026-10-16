// Datas e horas locais de uma unidade (fuso IANA) ↔ instantes UTC. Domínio puro: sem I/O.
// DataLocal = "AAAA-MM-DD"; HoraLocal = "HH:MM" (aceita "HH:MM:SS", formato do Postgres).

export type DataLocal = string;
export type HoraLocal = string;

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;

export function dataValida(data: string): boolean {
  const m = RE_DATA.exec(data);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === data;
}

export function horaValida(hora: string): boolean {
  return RE_HORA.test(hora);
}

/** Minutos desde a meia-noite. "24:00" é aceito como fim do dia. */
export function minutosDoDia(hora: HoraLocal): number {
  if (hora === "24:00" || hora === "24:00:00") return 24 * 60;
  const m = RE_HORA.exec(hora);
  if (!m) throw new RangeError(`Hora inválida: ${hora}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function horaDeMinutos(minutos: number): HoraLocal {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function paraUtc(data: DataLocal): number {
  const m = RE_DATA.exec(data);
  if (!m || !dataValida(data)) throw new RangeError(`Data inválida: ${data}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(data: DataLocal): number {
  return new Date(paraUtc(data)).getUTCDay();
}

export function somarDias(data: DataLocal, dias: number): DataLocal {
  return new Date(paraUtc(data) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de `data`. */
export function inicioDaSemana(data: DataLocal): DataLocal {
  return somarDias(data, -((diaSemana(data) + 6) % 7));
}

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(timezone: string): Intl.DateTimeFormat {
  let f = formatadores.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadores.set(timezone, f);
  }
  return f;
}

export function timezoneValido(timezone: string): boolean {
  try {
    formatador(timezone);
    return true;
  } catch {
    return false;
  }
}

function camposLocais(instante: Date, timezone: string) {
  const partes = formatador(timezone).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/** Diferença (em ms) entre o relógio local do fuso e o UTC naquele instante. */
function deslocamento(instanteMs: number, timezone: string): number {
  const c = camposLocais(new Date(instanteMs), timezone);
  const comoUtc = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto, c.segundo);
  return comoUtc - Math.floor(instanteMs / 1000) * 1000;
}

/** Instante UTC da data/hora local no fuso informado. */
export function instanteLocal(data: DataLocal, hora: HoraLocal, timezone: string): Date {
  const ingenuo = paraUtc(data) + minutosDoDia(hora) * 60_000;
  const primeiro = ingenuo - deslocamento(ingenuo, timezone);
  // Segunda passada corrige quando o deslocamento muda entre os dois instantes (horário de verão).
  const segundo = ingenuo - deslocamento(primeiro, timezone);
  return new Date(segundo);
}

export type PartesLocais = { data: DataLocal; hora: HoraLocal; minutos: number; diaSemana: number };

export function partesLocais(instante: Date, timezone: string): PartesLocais {
  const c = camposLocais(instante, timezone);
  const data = `${c.ano}-${String(c.mes).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
  const minutos = c.hora * 60 + c.minuto;
  return { data, hora: horaDeMinutos(minutos), minutos, diaSemana: diaSemana(data) };
}

export function hojeNoFuso(timezone: string, agora: Date = new Date()): DataLocal {
  return partesLocais(agora, timezone).data;
}
