"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotaoCopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // fallback caso clipboard não esteja disponível
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={copiado ? "default" : "outline"}
        size="sm"
        onClick={copiar}
        className={copiado ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" : "gap-1.5"}
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copiado ? "Link Copiado!" : "Copiar Link"}</span>
      </Button>

      <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <a href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" />
          <span>Abrir Página Pública</span>
        </a>
      </Button>
    </div>
  );
}
