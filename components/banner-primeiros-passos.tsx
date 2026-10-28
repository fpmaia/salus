"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket } from "lucide-react";
import type { Etapa } from "@/src/server/primeiros-passos";

export function BannerPrimeirosPassos({ etapas }: { etapas: Etapa[] }) {
  const pathname = usePathname();
  const [expandido, setExpandido] = useState(false);
  const [minimizado, setMinimizado] = useState(false);

  const feitas = etapas.filter((e) => e.feita).length;
  if (feitas === etapas.length) return null;

  const proxima = etapas.find((e) => !e.feita);
  if (!proxima) return null;

  const pct = Math.round((feitas / etapas.length) * 100);

  if (minimizado) {
    return (
      <div className="border-b bg-primary/5 px-4 py-1 text-center text-xs text-muted-foreground print:hidden flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Rocket className="size-3 text-primary" />
          <span>Primeiros passos: {pct}% concluídos ({feitas} de {etapas.length})</span>
        </span>
        <button
          onClick={() => setMinimizado(false)}
          className="text-primary font-medium hover:underline text-xs"
        >
          Expandir guia
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-background px-4 py-2.5 shadow-2xs print:hidden transition-all">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Rocket className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Configuração inicial ({feitas}/{etapas.length})
              </span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-primary/20 sm:w-24">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Próximo: <strong className="text-foreground">{proxima.titulo}</strong> — {proxima.descricao}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <button
            onClick={() => setExpandido(!expandido)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50"
          >
            <span>Ver todas as etapas</span>
            {expandido ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          {pathname !== proxima.href && (
            <Link
              href={proxima.href}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              Ir para {proxima.titulo} →
            </Link>
          )}

          <button
            onClick={() => setMinimizado(true)}
            className="text-xs text-muted-foreground hover:text-foreground ml-1"
            title="Minimizar barra"
            aria-label="Minimizar guia de primeiros passos"
          >
            ✕
          </button>
        </div>
      </div>

      {expandido && (
        <div className="mx-auto mt-3 max-w-6xl pt-3 border-t border-border/50">
          <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 text-xs">
            {etapas.map((e, i) => {
              const destaque = e.chave === proxima.chave;
              return (
                <li key={e.chave}>
                  <Link
                    href={e.href}
                    className={`flex flex-col gap-1 rounded-lg border p-2 transition-colors h-full ${
                      destaque
                        ? "border-primary bg-primary/10 shadow-xs"
                        : e.feita
                        ? "border-success/30 bg-success/5 hover:bg-success/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[11px] text-muted-foreground">Passo {i + 1}</span>
                      {e.feita ? (
                        <CheckCircle2 className="size-3.5 text-success" />
                      ) : (
                        <Circle className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <span className={`font-medium line-clamp-1 ${e.feita ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {e.titulo}
                    </span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">
                      {e.descricao}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
