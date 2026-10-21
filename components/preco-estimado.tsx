"use client";

import { useEffect, useRef, useState } from "react";
import { estimarReserva, type RegraDePreco } from "@/src/domain/contratos";
import { minutosDoDia } from "@/src/domain/tempo";

/**
 * Valor estimado da reserva pelo contrato do profissional, recalculado conforme os campos
 * `horaInicio`/`horaFim` do formulário em volta mudam.
 */
export function PrecoEstimado({ regra, contratoCodigo }: { regra: RegraDePreco | null; contratoCodigo?: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [minutos, setMinutos] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const ler = () => {
      const inicio = (form.elements.namedItem("horaInicio") as HTMLInputElement | null)?.value ?? "";
      const fim = (form.elements.namedItem("horaFim") as HTMLInputElement | null)?.value ?? "";
      const valido = /^\d{2}:\d{2}$/.test(inicio) && /^\d{2}:\d{2}$/.test(fim);
      setMinutos(valido ? minutosDoDia(fim) - minutosDoDia(inicio) : 0);
    };
    // Depois do reset, os campos voltam ao valor inicial só no fim do evento.
    const depoisDoReset = () => setTimeout(ler);
    ler();
    form.addEventListener("input", ler);
    form.addEventListener("reset", depoisDoReset);
    return () => {
      form.removeEventListener("input", ler);
      form.removeEventListener("reset", depoisDoReset);
    };
  }, []);

  const { texto } = estimarReserva(regra, minutos);
  return (
    <p ref={ref} className="rounded-md bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
      <span className="font-medium">Valor estimado: </span>
      {texto}
      {contratoCodigo && <span className="block text-xs text-muted-foreground">Pelo contrato {contratoCodigo}. O valor final sai no fechamento do mês.</span>}
    </p>
  );
}
