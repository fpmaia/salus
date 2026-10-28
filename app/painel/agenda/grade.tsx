"use client";

import Link from "next/link";
import { cn } from "cn";
import { segmentarReserva, slotAberto, type ConfigUnidade, type SegmentoReserva } from "@/src/domain/reservas";
import { diaSemana, horaDeMinutos, minutosDoDia, type DataLocal } from "@/src/domain/tempo";
import type { ReservaNaAgenda } from "@/src/domain/reservas";

export type ColunaGrade = { chave: string; titulo: string; data: DataLocal; salaId: string };

const DIAS_NOMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

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
  isSemana?: boolean;
  hrefSlot?: (coluna: ColunaGrade, hora: string) => string;
  hrefReserva?: (
    reserva: ReservaNaAgenda,
    segmento?: { horaInicio: string; horaFim: string; tipo: "ocupado" | "vago" },
  ) => string | null;
  aoClicarSlot?: (coluna: ColunaGrade, hora: string) => void;
  aoClicarReserva?: (
    reserva: ReservaNaAgenda,
    segmento: SegmentoReserva,
  ) => void;
};

const ALTURA_SLOT_REM = 2.25; // 36px por slot

/** Grade de horários estilo Google Calendar: linhas = slots, colunas = salas (dia) ou dias (semana). */
export function GradeAgenda({
  config,
  colunas,
  reservas,
  inicioMin,
  fimMin,
  agora,
  podeReservar,
  isSemana,
  hrefSlot,
  hrefReserva,
  aoClicarSlot,
  aoClicarReserva,
}: Props) {
  const slot = config.slotMinutos;
  const linhas: number[] = [];
  for (let m = inicioMin; m < fimMin; m += slot) linhas.push(m);

  if (colunas.length === 0) {
    return <p className="text-sm text-muted-foreground p-8 text-center">Nenhuma sala ativa nesta unidade.</p>;
  }
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground p-8 text-center">A unidade não funciona neste período.</p>;
  }

  const semanaAtiva = isSemana ?? colunas.length === 7;
  const linhaDe = (hora: string) => Math.max(0, Math.round((minutosDoDia(hora) - inicioMin) / slot));
  const passou = (data: DataLocal, minutos: number) => data < agora.data || (data === agora.data && minutos < agora.minutos);

  // Calcula a linha indicadora de tempo real de hoje
  const linhaTempoRealMin = agora.minutos >= inicioMin && agora.minutos <= fimMin ? agora.minutos : null;
  const offsetLinhaTempoRealRem = linhaTempoRealMin !== null
    ? ((linhaTempoRealMin - inicioMin) / slot) * ALTURA_SLOT_REM
    : null;

  // Achar o índice da coluna de hoje (para a linha de tempo no modo semana)
  const indiceHoje = colunas.findIndex((c) => c.data === agora.data);

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border/80 bg-background shadow-xs">
      <div
        className={cn(
          "grid text-xs select-none",
          semanaAtiva ? "w-full min-w-[760px] md:min-w-0" : "min-w-max"
        )}
        style={{
          gridTemplateColumns: semanaAtiva
            ? `3.5rem repeat(${colunas.length}, minmax(0, 1fr))`
            : `4.5rem repeat(${colunas.length}, minmax(11rem, 1fr))`,
          gridTemplateRows: `auto repeat(${linhas.length}, ${ALTURA_SLOT_REM}rem)`,
        }}
      >
        {/* Canto superior esquerdo */}
        <div className="sticky left-0 top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-xs p-2 text-center text-[10px] font-semibold text-muted-foreground">
          GMT-3
        </div>

        {/* Cabeçalho das Colunas (Salas ou Dias estilo Google Calendar) */}
        {colunas.map((c, i) => {
          const ehHoje = c.data === agora.data;
          const diaSemanaNum = diaSemana(c.data);
          const diaNome = DIAS_NOMES[diaSemanaNum] ?? "";
          const diaDoMes = Number(c.data.split("-")[2] ?? "0");

          return (
            <div
              key={c.chave}
              className={cn(
                "sticky top-0 z-10 border-b border-l border-border/70 backdrop-blur-xs px-2 py-2 text-center flex flex-col items-center justify-center gap-1",
                ehHoje ? "bg-primary/5" : "bg-muted/20"
              )}
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {semanaAtiva ? (
                /* Cabeçalho da Semana estilo Google Calendar */
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      ehHoje ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {diaNome}
                  </span>
                  <div
                    className={cn(
                      "size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                      ehHoje
                        ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/20"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    {diaDoMes}
                  </div>
                </div>
              ) : (
                /* Cabeçalho do Dia (Salas) */
                <span className="text-xs truncate max-w-full font-bold text-foreground">
                  {c.titulo}
                </span>
              )}
            </div>
          );
        })}

        {/* Linhas da Grade de Horários (Coluna 1) */}
        {linhas.map((m, l) => (
          <div
            key={m}
            className="sticky left-0 z-20 border-t border-border/40 bg-background/95 pr-2 text-right font-mono text-[10px] sm:text-[11px] font-medium text-muted-foreground flex items-center justify-end"
            style={{ gridColumn: 1, gridRow: l + 2 }}
          >
            {m % 60 === 0 || slot >= 60 ? horaDeMinutos(m) : ""}
          </div>
        ))}

        {/* Células de Fundo / Slots Clicáveis */}
        {colunas.map((c, i) => {
          const ehHoje = c.data === agora.data;
          return linhas.map((m, l) => {
            const hora = horaDeMinutos(m);
            const aberto = slotAberto(config, c.data, hora);
            const disponivel = aberto && podeReservar && !passou(c.data, m);
            const estilo = { gridColumn: i + 2, gridRow: l + 2 };
            const classe = cn(
              "border-t border-l border-border/30 transition-colors relative",
              aberto ? (ehHoje ? "bg-primary/[0.02]" : "bg-background") : "bg-muted/40",
              disponivel && "hover:bg-primary/10 cursor-pointer group"
            );

            const linkUrl = hrefSlot ? hrefSlot(c, hora) : "#";

            return disponivel ? (
              <Link
                key={`${c.chave}-${m}`}
                href={linkUrl}
                scroll={false}
                onClick={(e) => {
                  if (aoClicarSlot) {
                    e.preventDefault();
                    aoClicarSlot(c, hora);
                  }
                }}
                className={classe}
                style={estilo}
                aria-label={`Agendar em ${c.titulo} às ${hora}`}
                draggable={false}
                data-alvo=""
                data-sala={c.salaId}
                data-data={c.data}
                data-inicio-min={m}
              >
                <div className="size-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-primary/70 font-semibold">
                  +
                </div>
              </Link>
            ) : (
              <div key={`${c.chave}-${m}`} className={classe} style={estilo} />
            );
          });
        })}

        {/* Indicador de Linha de Tempo Real (Vermelha estilo Google Calendar) */}
        {offsetLinhaTempoRealRem !== null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
            style={{
              top: `calc(${offsetLinhaTempoRealRem}rem + 2.75rem)`,
            }}
          >
            {semanaAtiva && indiceHoje >= 0 ? (
              /* No modo semana, a bolinha e linha destacam o dia de hoje */
              <div
                className="absolute flex items-center"
                style={{
                  left: `calc(3.5rem + ${(indiceHoje / colunas.length) * 100}%)`,
                  width: `${(1 / colunas.length) * 100}%`,
                }}
              >
                <div className="size-2 rounded-full bg-destructive shadow-xs -ml-1 shrink-0" />
                <div className="h-0.5 w-full bg-destructive shadow-2xs" />
              </div>
            ) : (
              /* No modo dia, a linha atravessa as salas */
              <div className="flex items-center w-full">
                <div className="size-2 rounded-full bg-destructive shadow-xs -ml-1 shrink-0" />
                <div className="h-0.5 w-full bg-destructive/80 shadow-2xs" />
              </div>
            )}
          </div>
        )}

        {/* Eventos: Reservas e Atendimentos de Pacientes */}
        {reservas.flatMap((r) => {
          const coluna = colunas.findIndex((c) => c.salaId === r.salaId && c.data === r.data);
          if (coluna < 0) return [];
          const segmentos = segmentarReserva(r);

          return segmentos.map((seg) => {
            const inicio = linhaDe(seg.horaInicio);
            const fim = Math.max(inicio + 1, Math.min(linhas.length, linhaDe(seg.horaFim)));
            if (fim <= inicio) return null;

            const href = hrefReserva
              ? hrefReserva(r, { horaInicio: seg.horaInicio, horaFim: seg.horaFim, tipo: seg.tipo })
              : "#";
            const temPaciente = seg.tipo === "ocupado";

            const conteudo = (
              <div className="flex h-full flex-col justify-between gap-1 p-1.5 sm:p-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    {temPaciente ? (
                      <>
                        <span className="block truncate font-bold text-[11px] sm:text-xs text-foreground">
                          👤 {seg.pacienteNome}
                        </span>
                        <span className="block truncate text-[10px] sm:text-[11px] font-medium text-muted-foreground mt-0.5">
                          🩺 {r.profissionalNome ?? "Médico"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block truncate font-bold text-[11px] sm:text-xs text-foreground">
                          🩺 {r.profissionalNome ?? "Turno"}
                        </span>
                        <span className="block truncate text-[10px] font-semibold text-warning mt-0.5 flex items-center gap-1">
                          <span>⏳</span>
                          {r.ehSalaFixa ? "Horário Vago" : "Vago"}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {r.ehSalaFixa && (
                      <span className="inline-flex shrink-0 items-center rounded-md bg-warning/20 px-1 py-0.2 text-[8px] sm:text-[9px] font-bold uppercase tracking-tight text-warning border border-warning/30">
                        {r.contratoCodigo ? `Fixa ${r.contratoCodigo}` : "Fixa"}
                      </span>
                    )}
                    {temPaciente ? (
                      <span
                        className={`inline-flex shrink-0 items-center rounded-md px-1 py-0.2 text-[8px] sm:text-[9px] font-bold uppercase tracking-tight ${
                          seg.statusAtendimento === "presente"
                            ? "bg-warning/25 text-warning border border-warning/40 animate-pulse"
                            : seg.statusAtendimento === "realizado"
                            ? "bg-success/20 text-success border border-success/30"
                            : "bg-primary/15 text-primary border border-primary/25"
                        }`}
                      >
                        {seg.statusAtendimento === "presente" ? "Chegou" : seg.statusAtendimento ?? "Agendado"}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-md bg-warning/15 px-1 py-0.2 text-[8px] sm:text-[9px] font-semibold text-warning border border-warning/30">
                        + Paciente
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-muted-foreground border-t border-border/40 pt-0.5 mt-auto font-mono">
                  <span>
                    {seg.horaInicio} – {seg.horaFim}
                  </span>
                  {!temPaciente && (
                    <span className="text-[9px] sm:text-[10px] font-bold text-warning hover:underline">
                      + Agendar
                    </span>
                  )}
                </div>
              </div>
            );

            const classe = cn(
              "z-10 m-0.5 sm:m-1 overflow-hidden rounded-xl text-left transition-all shadow-xs cursor-pointer select-none",
              r.status === "concluida" && "opacity-60",
              temPaciente
                ? (seg.statusAtendimento === "presente"
                    ? "border-2 border-warning/70 bg-warning/15 hover:bg-warning/25 ring-2 ring-warning/30"
                    : seg.statusAtendimento === "realizado"
                    ? "border border-success/50 bg-success/15 hover:bg-success/20"
                    : "border border-primary/40 bg-card hover:border-primary hover:shadow-md")
                : (r.ehSalaFixa
                    ? "border-2 border-dashed border-warning/70 bg-warning/10 text-warning hover:bg-warning/20 hover:border-warning"
                    : "border-2 border-dashed border-primary/50 bg-primary/10 text-foreground hover:bg-primary/20 hover:border-primary")
            );

            const estilo = { gridColumn: coluna + 2, gridRow: `${inicio + 2} / ${fim + 2}` };

            const arrastavel =
              temPaciente &&
              seg.atendimentoId &&
              (seg.statusAtendimento === "agendado" || seg.statusAtendimento === "confirmado") &&
              r.status === "ativa";

            const atributos = arrastavel
              ? {
                  draggable: true,
                  "data-agendamento": seg.atendimentoId,
                  "data-duracao": minutosDoDia(seg.horaFim) - minutosDoDia(seg.horaInicio),
                  title: "Arraste para remarcar ou clique para ver detalhes",
                }
              : !temPaciente && r.status === "ativa" && href
              ? {
                  draggable: false,
                  "data-alvo": "",
                  "data-sala": r.salaId,
                  "data-data": r.data,
                  "data-inicio-min": minutosDoDia(seg.horaInicio),
                  "data-linhas": fim - inicio,
                  title: "Clique para agendar paciente neste horário do médico",
                }
              : {};

            const handleClick = (e: React.MouseEvent) => {
              if (aoClicarReserva) {
                e.preventDefault();
                aoClicarReserva(r, seg);
              }
            };

            return href ? (
              <Link
                key={seg.chave}
                href={href}
                scroll={false}
                onClick={handleClick}
                className={cn(classe, arrastavel && "cursor-grab")}
                style={estilo}
                {...atributos}
              >
                {conteudo}
              </Link>
            ) : (
              <div key={seg.chave} className={classe} style={estilo} onClick={handleClick}>
                {conteudo}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
