import Link from "next/link";
import { cn } from "cn";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type Migalha = { rotulo: string; href?: string };

/**
 * Cabeçalho padrão das páginas: trilha (opcional), título, descrição e ações à direita.
 * No celular as ações descem para baixo do título.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  trilha,
  acoes,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  trilha?: Migalha[];
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {trilha && trilha.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {trilha.map((m, i) => (
              <span key={`${m.rotulo}-${i}`} className="contents">
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {m.href && i < trilha.length - 1 ? (
                    <BreadcrumbLink asChild>
                      <Link href={m.href}>{m.rotulo}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{m.rotulo}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descricao && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </div>
  );
}
