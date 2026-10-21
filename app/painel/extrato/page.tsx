import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { competenciaAtual, competenciaSchema, extrato } from "@/src/server/financeiro";
import { listarCobrancas, pagamentoOnlineAtivo } from "@/src/server/cobrancas";
import { listarContratos } from "@/src/server/contratos";
import { formatarDataBr } from "@/src/server/reservas";
import { pagarComPixAcao } from "./actions";
import { PixParaPagar } from "./pix";
import { listarNotas } from "@/src/server/fiscal";
import { ListaCobrancas } from "../financeiro/cobrancas-ui";
import { NavCompetencia, rotuloCompetencia, TabelaExtrato } from "../financeiro/componentes";

export default async function MeuExtratoPage({ searchParams }: PageProps<"/painel/extrato">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "extrato.proprio");
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  const atual = await competenciaAtual(ctx);
  const competencia = informada?.success ? informada.data : atual;
  const [dados, notas, cobrancas, contratos, online] = await Promise.all([
    extrato(ctx, { competencia }),
    listarNotas(ctx, competencia),
    listarCobrancas(ctx),
    listarContratos(ctx),
    pagamentoOnlineAtivo(ctx),
  ]);
  const saldo = dados.saldoFinal;
  const contrato = contratos.find((c) => c.situacao === "vigente");
  const emAberto = cobrancas.find((c) => c.status === "pendente" || c.status === "vencida");
  // No mês corrente, o saldo final é o que se deve hoje.
  const podePagar = online && competencia === atual && (saldo > 0 || emAberto);

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
      {podePagar && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Pagar</CardTitle>
            <CardDescription>A baixa no extrato é automática quando o pagamento é confirmado.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {emAberto ? (
              <>
                <p className="text-sm">
                  Cobrança em aberto: <span className="font-semibold tabular-nums">{formatarMoeda(emAberto.valorCentavos)}</span>, vence{" "}
                  {formatarDataBr(emAberto.vencimento)}.
                </p>
                {emAberto.pixCopiaECola ? (
                  <PixParaPagar copiaECola={emAberto.pixCopiaECola} />
                ) : emAberto.invoiceUrl ? (
                  <a href={emAberto.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                    Abrir o link de pagamento
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">Ambiente de teste: o pagamento é simulado pela equipe do espaço.</p>
                )}
              </>
            ) : (
              <FormAcao acao={pagarComPixAcao} textoBotao={`Pagar ${formatarMoeda(saldo)} com PIX`} textoPendente="Gerando o PIX…" />
            )}
          </CardContent>
        </Card>
      )}

      {contrato && (
        <Card>
          <CardHeader>
            <CardDescription>Meu contrato</CardDescription>
            <CardTitle className="text-base">
              <span className="font-mono">{contrato.codigo}</span> · {contrato.modelo}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{contrato.resumo}</span>
            <Link href={`/painel/contratos/${contrato.id}`} className="text-primary underline-offset-4 hover:underline">
              Ver contrato completo →
            </Link>
          </CardContent>
        </Card>
      )}

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

      {cobrancas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cobranças</CardTitle>
            <CardDescription>Pague pelo link (PIX, boleto ou cartão). A baixa no extrato é automática.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaCobrancas cobrancas={cobrancas} gerenciar={false} />
          </CardContent>
        </Card>
      )}

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
