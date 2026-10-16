import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { competenciaAtual, competenciaSchema, extrato } from "@/src/server/financeiro";
import { listarNotas } from "@/src/server/fiscal";
import { NavCompetencia, rotuloCompetencia, TabelaExtrato } from "../financeiro/componentes";

export default async function MeuExtratoPage({ searchParams }: PageProps<"/painel/extrato">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "extrato.proprio");
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  const competencia = informada?.success ? informada.data : await competenciaAtual(ctx);
  const [dados, notas] = await Promise.all([extrato(ctx, { competencia }), listarNotas(ctx, competencia)]);
  const saldo = dados.saldoFinal;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meu extrato</h1>
          <p className="text-sm text-muted-foreground">Sua conta corrente com o espaço.</p>
        </div>
        <NavCompetencia competencia={competencia} href={(x) => `/painel/extrato?competencia=${x}`} />
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Saldo ao fim de {rotuloCompetencia(competencia)}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {saldo === 0 ? "Em dia" : saldo > 0 ? `${formatarMoeda(saldo)} a pagar` : `${formatarMoeda(-saldo)} a receber`}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
          <CardDescription>
            {dados.fechamento?.fechadoEm ? "Mês fechado pelo espaço." : "Mês em aberto: os valores podem mudar até o fechamento."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaExtrato linhas={dados.linhas} saldoAnterior={dados.saldoAnterior} saldoFinal={dados.saldoFinal} visao="profissional" />
        </CardContent>
      </Card>

      {notas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nota fiscal de {rotuloCompetencia(competencia)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {notas.map(({ nota }) => (
                <li key={nota.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {nota.numero ? `NFS-e nº ${nota.numero}` : `DPS ${nota.serieDps}/${nota.numeroDps}`} · {formatarMoeda(nota.valorCentavos)}
                    <span className="ml-2 text-xs text-muted-foreground">{nota.status}</span>
                  </span>
                  {nota.urlDanfse && nota.status === "autorizada" && (
                    <a href={nota.urlDanfse} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      Baixar DANFSe
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
