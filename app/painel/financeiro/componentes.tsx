import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { proximaCompetencia, ROTULOS_TIPO } from "@/src/domain/financeiro";
import { somarDias } from "@/src/domain/tempo";
import type { LinhaExtrato } from "@/src/server/financeiro";
import { formatarDataBr } from "@/src/server/reservas";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloCompetencia(competencia: string): string {
  return `${MESES[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(0, 4)}`;
}

export function competenciaAnterior(competencia: string): string {
  return `${somarDias(competencia, -1).slice(0, 7)}-01`;
}

/** Navegação ← mês → que preserva os outros parâmetros (base já com "?" ou "&"). */
export function NavCompetencia({ competencia, href }: { competencia: string; href: (c: string) => string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={href(competenciaAnterior(competencia).slice(0, 7))}>←</Link>
      </Button>
      <span className="min-w-20 text-center text-sm font-medium">{rotuloCompetencia(competencia)}</span>
      <Button asChild variant="outline" size="sm">
        <Link href={href(proximaCompetencia(competencia).slice(0, 7))}>→</Link>
      </Button>
    </div>
  );
}

/** Saldo do ponto de vista do espaço: positivo = profissional deve; negativo = espaço deve. */
export function Saldo({ centavos, className }: { centavos: number; className?: string }) {
  if (centavos === 0) return <span className={cn("tabular-nums text-muted-foreground", className)}>{formatarMoeda(0)}</span>;
  return (
    <span className={cn("tabular-nums", centavos > 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-400", className)}>
      {formatarMoeda(Math.abs(centavos))}
      <span className="ml-1 text-xs text-muted-foreground">{centavos > 0 ? "a receber do profissional" : "a pagar ao profissional"}</span>
    </span>
  );
}

export function TabelaExtrato({
  linhas,
  saldoAnterior,
  saldoFinal,
  visao = "espaco",
}: {
  linhas: LinhaExtrato[];
  saldoAnterior: number;
  saldoFinal: number;
  /** "profissional": inverte o texto (débito = você paga). */
  visao?: "espaco" | "profissional";
}) {
  const textoSaldo = (c: number) =>
    visao === "profissional" ? (c > 0 ? `${formatarMoeda(c)} a pagar` : c < 0 ? `${formatarMoeda(-c)} a receber` : formatarMoeda(0)) : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-2 font-medium">Data</th>
            <th className="py-2 pr-2 font-medium">Descrição</th>
            <th className="py-2 pr-2 text-right font-medium">Débito</th>
            <th className="py-2 pr-2 text-right font-medium">Crédito</th>
            <th className="py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b text-muted-foreground">
            <td className="py-2 pr-2" colSpan={4}>
              Saldo anterior
            </td>
            <td className="py-2 text-right tabular-nums">{textoSaldo(saldoAnterior) ?? formatarMoeda(saldoAnterior)}</td>
          </tr>
          {linhas.map((l) => (
            <tr key={l.id} className={cn("border-b", l.estorno && "text-muted-foreground")}>
              <td className="py-2 pr-2 whitespace-nowrap tabular-nums">{formatarDataBr(l.dataReferencia)}</td>
              <td className="py-2 pr-2">
                <span className="block">{ROTULOS_TIPO[l.tipo]}</span>
                <span className="block text-xs text-muted-foreground">{l.descricao}</span>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{l.natureza === "debito" ? formatarMoeda(l.valorCentavos) : ""}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{l.natureza === "credito" ? formatarMoeda(l.valorCentavos) : ""}</td>
              <td className="py-2 text-right tabular-nums">{textoSaldo(l.saldoApos) ?? formatarMoeda(l.saldoApos)}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                Nenhuma movimentação neste mês.
              </td>
            </tr>
          )}
          <tr className="font-medium">
            <td className="py-2 pr-2" colSpan={4}>
              Saldo final
            </td>
            <td className="py-2 text-right tabular-nums">{textoSaldo(saldoFinal) ?? formatarMoeda(saldoFinal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
