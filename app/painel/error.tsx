"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Painel Error Boundary]:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4 border border-destructive/20 shadow-sm">
        <AlertTriangle className="size-8" />
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground font-heading mb-2">
        Algo deu errado nesta seção
      </h1>

      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-2">
        Não foi possível carregar os dados desta página no momento.
      </p>

      {error.digest && (
        <p className="text-[11px] font-mono text-muted-foreground/70 bg-muted px-2.5 py-1 rounded-md mb-6">
          Identificador: {error.digest}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs mt-2">
        <Button onClick={() => reset()} className="flex-1">
          <RotateCcw className="size-4 mr-2" />
          Tentar novamente
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/painel">
            <Home className="size-4 mr-2" />
            Início
          </Link>
        </Button>
      </div>
    </main>
  );
}
