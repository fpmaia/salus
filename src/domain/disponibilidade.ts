// Horários livres para o agendamento online. Domínio puro: sem I/O.
import { partesLocais, type DataLocal } from "./tempo";

export type Intervalo = { inicio: Date; fim: Date };

export type ParametrosDisponibilidade = {
  /** Reservas de sala ativas do profissional (a oferta). */
  reservas: Intervalo[];
  /** Atendimentos já marcados (não cancelados) do profissional. */
  ocupados: Intervalo[];
  duracaoMin: number;
  /** Passo entre inícios possíveis (slot da unidade). */
  passoMin: number;
  agora: Date;
  antecedenciaMinHoras: number;
  janelaDias: number;
};

const MIN = 60_000;

function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

/** Inícios possíveis, em ordem, sem repetir (reservas encostadas não duplicam horários). */
export function horariosLivres(p: ParametrosDisponibilidade): Date[] {
  const minimo = p.agora.getTime() + p.antecedenciaMinHoras * 60 * MIN;
  const maximo = p.agora.getTime() + p.janelaDias * 24 * 60 * MIN;
  const passo = p.passoMin * MIN;
  const duracao = p.duracaoMin * MIN;
  const vistos = new Set<number>();
  const livres: Date[] = [];

  for (const r of p.reservas) {
    // Primeiro início alinhado ao passo dentro da reserva.
    const base = r.inicio.getTime();
    for (let t = base; t + duracao <= r.fim.getTime(); t += passo) {
      if (t < minimo || t >= maximo || vistos.has(t)) continue;
      const candidato = { inicio: new Date(t), fim: new Date(t + duracao) };
      if (p.ocupados.some((o) => sobrepoe(o, candidato))) continue;
      vistos.add(t);
      livres.push(candidato.inicio);
    }
  }
  return livres.sort((a, b) => a.getTime() - b.getTime());
}

/** Agrupa os horários por data local (para a página pública). */
export function agruparPorDia(horarios: Date[], timezone: string): { data: DataLocal; horas: string[] }[] {
  const dias = new Map<DataLocal, string[]>();
  for (const h of horarios) {
    const { data, hora } = partesLocais(h, timezone);
    dias.set(data, [...(dias.get(data) ?? []), hora]);
  }
  return [...dias.entries()].map(([data, horas]) => ({ data, horas }));
}

/** Slug a partir do nome: "Dra. Ana Lima" → "dra-ana-lima-x7k2". */
export function gerarSlug(nome: string, sufixo: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "profissional"}-${sufixo}`;
}
