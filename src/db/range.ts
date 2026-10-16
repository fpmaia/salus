// Conversão entre tstzrange do Postgres e { inicio, fim } (intervalo semiaberto [inicio, fim)).

export type Intervalo = { inicio: Date; fim: Date };

export function formatarRange({ inicio, fim }: Intervalo): string {
  return `[${inicio.toISOString()},${fim.toISOString()})`;
}

// Saída do Postgres: ["2026-10-16 11:00:00+00","2026-10-16 12:00:00+00")
function lerTimestamp(valor: string): Date {
  let iso = valor.trim().replace(/^"|"$/g, "").replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) throw new Error(`Timestamp inválido no range: ${valor}`);
  return data;
}

export function lerRange(valor: string): Intervalo {
  const corpo = valor.trim().slice(1, -1);
  const [inicio, fim] = corpo.split(",");
  if (!inicio || !fim) throw new Error(`Range sem limites: ${valor}`);
  return { inicio: lerTimestamp(inicio), fim: lerTimestamp(fim) };
}
