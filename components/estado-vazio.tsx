import { cn } from "cn";
import { Inbox, type LucideIcon } from "lucide-react";

/** Lista vazia com ícone, explicação curta e (opcional) a próxima ação. */
export function EstadoVazio({
  titulo,
  descricao,
  icone: Icone = Inbox,
  acao,
  className,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  icone?: LucideIcon;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icone className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium">{titulo}</p>
      {descricao && <p className="max-w-sm text-xs text-muted-foreground">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}
