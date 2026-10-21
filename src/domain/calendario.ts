// Evento de calendário (.ics, RFC 5545) para o paciente adicionar a consulta à própria agenda.
// Domínio puro: sem I/O.

export type EventoCalendario = {
  uid: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  local?: string | null;
  descricao?: string | null;
  /** Momento da geração (DTSTAMP). */
  geradoEm: Date;
};

/** 2030-03-05T13:00:00.000Z → 20300305T130000Z */
const dataIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapa texto do iCalendar: barra, ponto e vírgula, vírgula e quebras de linha. */
function texto(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Linhas com mais de 75 octetos são dobradas (continuação começa com espaço). */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const c of linha) {
    if (Buffer.byteLength(atual + c, "utf8") > 74) {
      partes.push(atual);
      atual = " ";
    }
    atual += c;
  }
  partes.push(atual);
  return partes.join("\r\n");
}

export function gerarIcs(e: EventoCalendario): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salus//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dataIcs(e.geradoEm)}`,
    `DTSTART:${dataIcs(e.inicio)}`,
    `DTEND:${dataIcs(e.fim)}`,
    `SUMMARY:${texto(e.titulo)}`,
    ...(e.local ? [`LOCATION:${texto(e.local)}`] : []),
    ...(e.descricao ? [`DESCRIPTION:${texto(e.descricao)}`] : []),
    // Lembrete no próprio celular, 2 horas antes.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT2H",
    `DESCRIPTION:${texto(e.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${linhas.map(dobrar).join("\r\n")}\r\n`;
}

/** Link de mapa para o endereço (abre o app de mapas do celular). */
export function linkDoMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}
