import Link from "next/link";
import { controlador } from "@/src/legal/documentos";

/** Links dos documentos legais e contato do encarregado (LGPD), nas páginas públicas. */
export function RodapeLegal({ className }: { className?: string }) {
  const { encarregadoEmail } = controlador();
  return (
    <nav aria-label="Documentos legais" className={className ?? "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"}>
      <Link href="/termos" className="hover:text-foreground hover:underline">
        Termos de Uso
      </Link>
      <Link href="/privacidade" className="hover:text-foreground hover:underline">
        Política de Privacidade
      </Link>
      <a href={`mailto:${encarregadoEmail}`} className="hover:text-foreground hover:underline">
        Encarregado de dados: {encarregadoEmail}
      </a>
    </nav>
  );
}
