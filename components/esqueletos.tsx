import { Skeleton } from "@/components/ui/skeleton";

// Esqueletos de carregamento com a mesma geometria das telas (cards rounded-xl com anel),
// para a página não "pular" quando os dados chegam.

const cartao = "rounded-xl bg-card ring-1 ring-foreground/10";

export function EsqueletoCabecalho({ comAcao = false }: { comAcao?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {comAcao && <Skeleton className="h-8 w-36" />}
    </div>
  );
}

export function EsqueletoIndicadores({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`${cartao} flex flex-col gap-3 p-4`}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className={`${cartao} flex flex-col gap-4 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-full max-w-md" />
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="flex flex-col divide-y">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto hidden h-4 w-28 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EsqueletoGrade() {
  return (
    <div className={`${cartao} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      <div className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] gap-1">
        {Array.from({ length: 4 * 10 }, (_, i) => (
          <Skeleton key={i} className={i % 4 === 0 ? "h-8 bg-muted/60" : "h-8 bg-muted/40"} />
        ))}
      </div>
    </div>
  );
}

/** Esqueleto padrão do painel: cabeçalho, indicadores e uma lista. */
export function EsqueletoPagina() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Carregando">
      <EsqueletoCabecalho />
      <EsqueletoIndicadores />
      <EsqueletoTabela linhas={4} />
    </div>
  );
}
