"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAviso } from "@/components/avisos";
import { horaDeMinutos } from "@/src/domain/tempo";
import { remarcarArrastandoAcao } from "./actions";

/**
 * Remarcar arrastando: a consulta (agendada ou confirmada) é solta num horário livre da grade
 * ou num trecho vago de uma reserva; a duração é mantida. No celular e pelo teclado, continua
 * valendo o "Remarcar" da consulta (arrastar não funciona em toque).
 */
export function GradeArrastavel({ slotMinutos, children }: { slotMinutos: number; children: React.ReactNode }) {
  const router = useRouter();
  const avisar = useAviso();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState(false);

  /** Destino a partir do elemento e da altura do ponteiro dentro dele. */
  function destinoDe(evento: React.DragEvent): { salaId: string; data: string; minutos: number } | null {
    const alvo = (evento.target as HTMLElement).closest<HTMLElement>("[data-alvo]");
    if (!alvo) return null;
    const inicio = Number(alvo.dataset.inicioMin);
    const linhas = Number(alvo.dataset.linhas ?? "1");
    const ret = alvo.getBoundingClientRect();
    const linha = Math.min(linhas - 1, Math.max(0, Math.floor(((evento.clientY - ret.top) / ret.height) * linhas)));
    return { salaId: alvo.dataset.sala!, data: alvo.dataset.data!, minutos: inicio + linha * slotMinutos };
  }

  return (
    <div
      className={arrastando ? "[&_[data-alvo]]:outline-dashed [&_[data-alvo]]:outline-1 [&_[data-alvo]]:outline-primary/30" : undefined}
      aria-busy={pendente}
      onDragStart={(e) => {
        const origem = (e.target as HTMLElement).closest<HTMLElement>("[data-agendamento]");
        if (!origem) return;
        e.dataTransfer.setData("application/x-salus-agendamento", `${origem.dataset.agendamento}|${origem.dataset.duracao}`);
        e.dataTransfer.effectAllowed = "move";
        setErro(null);
        setArrastando(true);
      }}
      onDragEnd={() => setArrastando(false)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-salus-agendamento") && (e.target as HTMLElement).closest("[data-alvo]")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        const dados = e.dataTransfer.getData("application/x-salus-agendamento");
        const destino = destinoDe(e);
        setArrastando(false);
        if (!dados || !destino) return;
        e.preventDefault();
        const [agendamentoId, duracao] = dados.split("|");
        const horaInicio = horaDeMinutos(destino.minutos);
        const horaFim = horaDeMinutos(Math.min(destino.minutos + Number(duracao), 24 * 60));
        iniciar(async () => {
          const r = await remarcarArrastandoAcao(agendamentoId, { data: destino.data, horaInicio, horaFim, salaId: destino.salaId });
          if (!r.ok) return setErro(r.erro);
          avisar?.(r.mensagem);
          router.refresh();
        });
      }}
    >
      {erro && (
        <p role="alert" className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {pendente && <p className="mb-2 text-xs text-muted-foreground">Remarcando…</p>}
      {children}
    </div>
  );
}
