import Link from "next/link";
import { cn } from "cn";
import { slotAberto, type ConfigUnidade } from "@/src/domain/reservas";
import { horaDeMinutos, minutosDoDia, type DataLocal } from "@/src/domain/tempo";
import type { ReservaNaAgenda } from "@/src/server/reservas";

export type ColunaGrade = { chave: string; titulo: string; data: DataLocal; salaId: string };

type Props = {
  config: ConfigUnidade;
  colunas: ColunaGrade[];
  reservas: ReservaNaAgenda[];
  /** Primeiro e último minuto exibidos (união dos horários das colunas). */
  inicioMin: number;
  fimMin: number;
  /** Instante atual em minutos locais, por data (para não oferecer slots que já passaram). */
  agora: { data: DataLocal; minutos: number };
  podeReservar: boolean;
  hrefSlot: (coluna: ColunaGrade, hora: string) => string;
  hrefReserva: (reserva: ReservaNaAgenda) => string | null;
};

const ALTURA_SLOT = "2rem";

/** Grade de horários: linhas = slots, colunas = salas (dia) ou dias (semana). */
export function GradeAgenda({ config, colunas, reservas, inicioMin, fimMin, agora, podeReservar, hrefSlot, hrefReserva }: Props) {
  const slot = config.slotMinutos;
  const linhas: number[] = [];
  for (let m = inicioMin; m < fimMin; m += slot) linhas.push(m);

  if (colunas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma sala ativa nesta unidade.</p>;
  }
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">A unidade não funciona neste período.</p>;
  }

  const linhaDe = (hora: string) => Math.max(0, Math.round((minutosDoDia(hora) - inicioMin) / slot));
  const passou = (data: DataLocal, minutos: number) => data < agora.data || (data === agora.data && minutos < agora.minutos);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid min-w-max text-xs"
        style={{
          gridTemplateColumns: `4rem repeat(${colunas.length}, minmax(8rem, 1fr))`,
          gridTemplateRows: `auto repeat(${linhas.length}, ${ALTURA_SLOT})`,
        }}
      >
        <div className="sticky left-0 z-20 border-b bg-background" />
        {colunas.map((c, i) => (
          <div
            key={c.chave}
            className="border-b border-l bg-muted/40 px-2 py-2 text-center font-medium"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {c.titulo}
          </div>
        ))}

        {linhas.map((m, l) => (
          <div
            key={m}
            className="sticky left-0 z-20 border-t bg-background pr-2 text-right text-muted-foreground"
            style={{ gridColumn: 1, gridRow: l + 2 }}
          >
            {m % 60 === 0 || slot >= 60 ? horaDeMinutos(m) : ""}
          </div>
        ))}

        {colunas.map((c, i) =>
          linhas.map((m, l) => {
            const hora = horaDeMinutos(m);
            const aberto = slotAberto(config, c.data, hora);
            const disponivel = aberto && podeReservar && !passou(c.data, m);
            const estilo = { gridColumn: i + 2, gridRow: l + 2 };
            const classe = cn("border-t border-l", aberto ? "bg-background" : "bg-muted/60");
            return disponivel ? (
              <Link
                key={`${c.chave}-${m}`}
                href={hrefSlot(c, hora)}
                scroll={false}
                className={cn(classe, "hover:bg-primary/10")}
                style={estilo}
                aria-label={`Reservar ${c.titulo} às ${hora}`}
              />
            ) : (
              <div key={`${c.chave}-${m}`} className={classe} style={estilo} />
            );
          }),
        )}

        {reservas.map((r) => {
          const coluna = colunas.findIndex((c) => c.salaId === r.salaId && c.data === r.data);
          if (coluna < 0) return null;
          const inicio = linhaDe(r.horaInicio);
          const fim = Math.min(linhas.length, linhaDe(r.horaFim));
          if (fim <= inicio) return null;
          const href = hrefReserva(r);
          const conteudo = (
            <>
              <span className="block truncate font-medium">{r.profissionalNome ?? "Ocupado"}</span>
              <span className="block truncate opacity-80">
                {r.horaInicio}–{r.horaFim}
                {r.recorrenciaId && " · semanal"}
              </span>
              {r.pacientes > 0 && (
                <span className="block truncate opacity-80">
                  {r.pacientes} {r.pacientes === 1 ? "paciente" : "pacientes"}
                </span>
              )}
            </>
          );
          const classe = cn(
            "z-10 m-0.5 overflow-hidden rounded-md px-2 py-1 text-left",
            r.status === "concluida" && "opacity-60",
            r.propria || r.profissionalNome
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/25 text-foreground",
          );
          const estilo = { gridColumn: coluna + 2, gridRow: `${inicio + 2} / ${fim + 2}` };
          return href ? (
            <Link key={r.id} href={href} scroll={false} className={cn(classe, "hover:opacity-90")} style={estilo}>
              {conteudo}
            </Link>
          ) : (
            <div key={r.id} className={classe} style={estilo}>
              {conteudo}
            </div>
          );
        })}
      </div>
    </div>
  );
}
