"use client";

import { Button } from "@/components/ui/button";

export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      Imprimir / salvar PDF
    </Button>
  );
}
