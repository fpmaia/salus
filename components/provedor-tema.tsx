"use client";

import { TooltipProvider } from "@/components/ui/tooltip";

/** Provedores de interface de toda a aplicação (dicas de ferramenta). O tema é do tema.tsx. */
export function ProvedoresUi({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>;
}
