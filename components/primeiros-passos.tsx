import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Etapa } from "@/src/server/primeiros-passos";

/** Primeiros passos do admin: progresso e o link de cada etapa; a próxima fica em destaque. */
export function PrimeirosPassos({ etapas }: { etapas: Etapa[] }) {
  const feitas = etapas.filter((e) => e.feita).length;
  if (feitas === etapas.length) return null;
  const proxima = etapas.find((e) => !e.feita);
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>Primeiros passos</CardTitle>
        <CardDescription>
          {feitas} de {etapas.length} feitos. Siga a ordem: cada etapa usa a anterior.
        </CardDescription>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={etapas.length} aria-valuenow={feitas} aria-label="Progresso dos primeiros passos">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(feitas / etapas.length) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-1">
          {etapas.map((e) => {
            const destaque = e === proxima;
            return (
              <li key={e.chave}>
                <Link
                  href={e.href}
                  className={`flex items-start gap-3 rounded-md px-2 py-2 text-sm ${destaque ? "bg-primary/10" : "hover:bg-muted"}`}
                >
                  {e.feita ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Feito" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="A fazer" />
                  )}
                  <span>
                    <span className={e.feita ? "text-muted-foreground line-through" : "font-medium"}>{e.titulo}</span>
                    {!e.feita && <span className="block text-xs text-muted-foreground">{e.descricao}</span>}
                  </span>
                  {destaque && <span className="ml-auto text-xs font-medium text-primary">Começar →</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
