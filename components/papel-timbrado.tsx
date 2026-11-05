import { cn } from "cn";
import type { TimbradoImpressao } from "@/src/server/documentos-personalizados";

/**
 * Cabeçalho do papel timbrado: logo opcional + linhas do cabeçalho (a 1ª em destaque).
 * Usado nas impressões e na prévia do editor.
 */
export function CabecalhoTimbrado({ timbrado, className }: { timbrado: Pick<TimbradoImpressao, "cabecalho" | "alinhamento" | "logo">; className?: string }) {
  const [principal, ...demais] = timbrado.cabecalho;
  const esquerda = timbrado.alinhamento === "esquerda";
  return (
    <header
      data-papel-timbrado="cabecalho"
      className={cn(
        "flex gap-4 border-b-2 border-primary/20 pb-5",
        esquerda ? "flex-row items-center text-left" : "flex-col items-center text-center",
        className,
      )}
    >
      {timbrado.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL do banco, sem otimização do next/image
        <img src={timbrado.logo} alt="Logo" className="max-h-16 w-auto max-w-40 object-contain print:max-h-14" />
      )}
      <div className="flex flex-col gap-1">
        {principal && <p className="text-lg font-bold uppercase tracking-tight text-foreground">{principal}</p>}
        {demais.map((linha, i) => (
          <p key={i} className="text-xs font-medium text-foreground/80">
            {linha}
          </p>
        ))}
      </div>
    </header>
  );
}

export function RodapeTimbrado({ timbrado, className }: { timbrado: Pick<TimbradoImpressao, "rodape">; className?: string }) {
  if (timbrado.rodape.length === 0) return null;
  return (
    <div data-papel-timbrado="rodape" className={cn("w-full border-t pt-3 text-center text-[10px] text-muted-foreground", className)}>
      {timbrado.rodape.map((linha, i) => (
        <p key={i}>{linha}</p>
      ))}
    </div>
  );
}
