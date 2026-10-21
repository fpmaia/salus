import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BotaoDispararImpressao } from "@/components/botao-imprimir";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarCpfCnpj } from "@/src/domain/documentos";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { ROTULOS_MODELO } from "@/src/domain/financeiro";
import { competenciaAtual, competenciaSchema, resumoCompetencia } from "@/src/server/financeiro";
import { rotuloCompetencia } from "../componentes";

// Relatório do mês por profissional para a contabilidade (imprimir / salvar em PDF pelo navegador).
export default async function RelatorioFechamentoPage({ searchParams }: PageProps<"/painel/financeiro/fechamento">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "financeiro.ver");
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  const competencia = informada?.success ? informada.data : await competenciaAtual(ctx);
  const linhas = await resumoCompetencia(ctx, competencia.slice(0, 7));
  const total = (campo: "debitos" | "creditos" | "saldoAcumulado") => linhas.reduce((acc, l) => acc + l[campo], 0);
  const abertos = linhas.filter((l) => !l.fechado).length;
  const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 text-foreground print:bg-white sm:px-6">
      <div className="mx-auto mb-6 flex max-w-5xl items-center justify-between print:hidden">
        <Link href={`/painel/financeiro?competencia=${competencia.slice(0, 7)}`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Financeiro
        </Link>
        <BotaoDispararImpressao />
      </div>

      <div className="mx-auto max-w-5xl rounded-2xl border bg-white p-8 text-black shadow-lg print:rounded-none print:border-none print:p-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b-2 border-neutral-200 pb-4">
          <div>
            <h1 className="text-xl font-bold">Fechamento de {rotuloCompetencia(competencia)}</h1>
            <p className="text-sm text-neutral-600">{ctx.tenantNome}</p>
          </div>
          <p className="text-xs text-neutral-600">
            Gerado em {fmtData(new Date())}
            {abertos > 0 && ` · ${abertos} profissional(is) com o mês ainda aberto`}
          </p>
        </header>

        <table className="w-full text-xs">
          <thead className="text-left text-neutral-600">
            <tr className="border-b">
              <th className="py-2 pr-2 font-medium">Profissional</th>
              <th className="py-2 pr-2 font-medium">CPF/CNPJ</th>
              <th className="py-2 pr-2 font-medium">Contrato</th>
              <th className="py-2 pr-2 text-right font-medium">Débitos do mês</th>
              <th className="py-2 pr-2 text-right font-medium">Créditos do mês</th>
              <th className="py-2 pr-2 text-right font-medium">Saldo acumulado</th>
              <th className="py-2 font-medium">Mês</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100">
                <td className="py-1.5 pr-2">{l.nome}</td>
                <td className="py-1.5 pr-2 tabular-nums">{l.documento ? formatarCpfCnpj(l.documento) : "—"}</td>
                <td className="py-1.5 pr-2">{l.modelo ? ROTULOS_MODELO[l.modelo] : "Sem contrato"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatarMoeda(l.debitos)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatarMoeda(l.creditos)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatarMoeda(l.saldoAcumulado)}</td>
                <td className="py-1.5">{l.fechado ? `Fechado${l.fechadoEm ? ` em ${fmtData(l.fechadoEm)}` : ""}` : "Aberto"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2 pr-2" colSpan={3}>
                Total ({linhas.length})
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatarMoeda(total("debitos"))}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatarMoeda(total("creditos"))}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatarMoeda(total("saldoAcumulado"))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="mt-6 text-[11px] text-neutral-500">
          Saldo positivo: o profissional deve ao espaço. Negativo: o espaço tem a repassar. Meses fechados não mudam; correções entram no mês seguinte.
        </p>
      </div>
    </div>
  );
}
