"use client";

import { Printer } from "lucide-react";

export function BotaoDispararImpressao() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
    >
      <Printer className="size-4" /> Imprimir / Salvar PDF
    </button>
  );
}
