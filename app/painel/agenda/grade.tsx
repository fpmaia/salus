import Link from "next/link";
import { cn } from "cn";
import { segmentarReserva, slotAberto, type ConfigUnidade, type SegmentoReserva } from "@/src/domain/reservas";
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
  hrefReserva: (
    reserva: ReservaNaAgenda,
    segmento?: { horaInicio: string; horaFim: string; tipo: "ocupado" | "vago" },
  ) => string | null;
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
                draggable={false}
                data-alvo=""
                data-sala={c.salaId}
                data-data={c.data}
                data-inicio-min={m}
              />
            ) : (
              <div key={`${c.chave}-${m}`} className={classe} style={estilo} />
            );
          }),
        )}

        {reservas.flatMap((r) => {
          const coluna = colunas.findIndex((c) => c.salaId === r.salaId && c.data === r.data);
          if (coluna < 0) return [];
          const segmentos = segmentarReserva(r);

          return segmentos.map((seg) => {
            const inicio = linhaDe(seg.horaInicio);
            const fim = Math.max(inicio + 1, Math.min(linhas.length, linhaDe(seg.horaFim)));
            if (fim <= inicio) return null;
            const href = hrefReserva(r, {
              horaInicio: seg.horaInicio,
              horaFim: seg.horaFim,
              tipo: seg.tipo,
            });
            const temPaciente = seg.tipo === "ocupado";

            const conteudo = (
              <div className="flex h-full flex-col justify-between gap-1 p-1">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-xs text-foreground">
                      🩺 {r.profissionalNome ?? (temPaciente ? "Ocupado" : "Reservado")}
                    </span>
                    {temPaciente ? (
                      <span className="block truncate text-[11px] font-medium text-success">
                        👤 Paciente: {seg.pacienteNome ?? "Agendado"}
                      </span>
                    ) : (
                      <span className="block truncate text-[10px] font-medium text-warning">
                        ⏳ Sem paciente (Horário vago)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {r.ehSalaFixa && (
                      <span className="inline-flex shrink-0 items-center rounded bg-warning/20 px-1 py-0.2 text-[8px] font-bold uppercase tracking-tight text-warning border border-warning/30">
                        {r.contratoCodigo ? `Fixa ${r.contratoCodigo}` : "Fixa"}
                      </span>
                    )}
                    {temPaciente ? (
                      <span className="inline-flex shrink-0 items-center rounded bg-success/20 px-1 py-0.2 text-[8px] font-bold uppercase tracking-tight text-success border border-success/30">
                        Ocupada
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded bg-warning/20 px-1 py-0.2 text-[8px] font-bold uppercase tracking-tight text-warning border border-warning/30">
                        Sem paciente
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-0.5 mt-auto">
                  <span>{seg.horaInicio}–{seg.horaFim}</span>
                  {temPaciente ? (
                    <span className="font-medium text-success capitalize">
                      {seg.statusAtendimento ? (seg.statusAtendimento === "presente" ? "Na recepção" : seg.statusAtendimento) : "Consulta"}
                    </span>
                  ) : (
                    <span className="font-medium text-warning">
                      Disponível
                    </span>
                  )}
                </div>
              </div>
            );

            const classe = cn(
              "z-10 m-0.5 overflow-hidden rounded-md text-left transition-all",
              r.status === "concluida" && "opacity-60",
              temPaciente
                ? (r.ehSalaFixa
                    ? "border border-success/50 bg-success/15 text-success shadow-xs"
                    : (r.propria || r.profissionalNome
                        ? "border border-success/40 bg-success/10 text-foreground shadow-xs"
                        : "bg-muted-foreground/25 text-foreground"))
                : (r.ehSalaFixa
                    ? "border-2 border-dashed border-warning/60 bg-warning/10 text-warning hover:bg-warning/20 shadow-xs"
                    : (r.propria || r.profissionalNome
                        ? "border border-dashed border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15"
                        : "bg-muted-foreground/25 text-foreground")),
            );
            const estilo = { gridColumn: coluna + 2, gridRow: `${inicio + 2} / ${fim + 2}` };
            // Arrastar: consulta ainda por acontecer vira origem; trecho vago de reserva ativa vira alvo.
            const arrastavel =
              temPaciente && seg.atendimentoId && (seg.statusAtendimento === "agendado" || seg.statusAtendimento === "confirmado") && r.status === "ativa";
            const atributos = arrastavel
              ? {
                  draggable: true,
                  "data-agendamento": seg.atendimentoId,
                  "data-duracao": minutosDoDia(seg.horaFim) - minutosDoDia(seg.horaInicio),
                  title: "Arraste para remarcar",
                }
              : !temPaciente && r.status === "ativa" && href
                ? {
                    draggable: false,
                    "data-alvo": "",
                    "data-sala": r.salaId,
                    "data-data": r.data,
                    "data-inicio-min": minutosDoDia(seg.horaInicio),
                    "data-linhas": fim - inicio,
                  }
                : {};
            return href ? (
              <Link key={seg.chave} href={href} scroll={false} className={cn(classe, "hover:opacity-90", arrastavel && "cursor-grab")} style={estilo} {...atributos}>
                {conteudo}
              </Link>
            ) : (
              <div key={seg.chave} className={classe} style={estilo}>
                {conteudo}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}


