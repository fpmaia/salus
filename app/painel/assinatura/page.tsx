import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { RECURSOS_LIMITADOS, ROTULOS_RECURSO } from "@/src/domain/cobranca";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { obterAssinatura } from "@/src/server/assinatura";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "../financeiro/componentes";
import { simularPagamentoFaturaAcao, trocarPlanoAcao } from "./actions";

const STATUS: Record<string, string> = {
  pendente: "Em aberto",
  vencida: "Vencida",
  paga: "Paga",
  estornada: "Estornada",
  cancelada: "Cancelada",
  erro: "Erro no envio (nova tentativa automática)",
};

export default async function AssinaturaPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "assinatura.ver");
  const { plano, uso, planos, faturas, emAtraso } = await obterAssinatura(ctx);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura do Salus</h1>
        <p className="text-sm text-muted-foreground">
          Plano {plano?.nome ?? "—"} · {plano ? `${formatarMoeda(plano.precoMensalCentavos)}/mês` : ""}
        </p>
      </div>

      {emAtraso && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Há fatura vencida</CardTitle>
            <CardDescription>Regularize pelo link de pagamento abaixo para evitar a suspensão do acesso.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Uso do plano</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {RECURSOS_LIMITADOS.map((r) => {
            const limite = plano?.limites[r];
            const proporcao = limite ? Math.min(1, uso[r] / limite) : 0;
            return (
              <div key={r} className="flex flex-col gap-1 text-sm">
                <span className="capitalize">{ROTULOS_RECURSO[r]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {uso[r]} de {limite ?? "ilimitado"}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className={`h-full rounded-full ${proporcao >= 1 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${proporcao * 100}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planos</CardTitle>
          <CardDescription>A troca vale a partir da próxima fatura. Para reduzir o plano, o uso atual precisa caber nos novos limites.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {planos.map((p) => (
            <div key={p.id} className={`flex flex-col gap-2 rounded-lg border p-4 ${p.id === plano?.id ? "border-primary" : ""}`}>
              <span className="font-medium">{p.nome}</span>
              <span className="text-xl font-semibold tabular-nums">{formatarMoeda(p.precoMensalCentavos)}</span>
              <span className="text-xs text-muted-foreground">
                {RECURSOS_LIMITADOS.map((r) => `${p.limites[r] ?? "∞"} ${ROTULOS_RECURSO[r]}`).join(" · ")}
              </span>
              {p.id === plano?.id ? (
                <span className="text-xs font-medium text-primary">Plano atual</span>
              ) : (
                <FormAcao
                  acao={trocarPlanoAcao.bind(null, p.codigo)}
                  textoBotao={p.precoMensalCentavos > (plano?.precoMensalCentavos ?? 0) ? "Fazer upgrade" : "Mudar para este"}
                  textoPendente="…"
                  variante="outline"
                  confirmar={`Mudar para o plano ${p.nome}?`}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
          <CardDescription>Cobradas via Asaas no dia 1º de cada mês, com vencimento no dia 10. Pague por PIX, boleto ou cartão.</CardDescription>
        </CardHeader>
        <CardContent>
          {faturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {faturas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {rotuloCompetencia(f.competencia)} · vence {formatarDataBr(f.vencimento)}
                    <span className="block text-xs text-muted-foreground">
                      {STATUS[f.status]}
                      {f.ultimoErro && ` · ${f.ultimoErro}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{formatarMoeda(f.valorCentavos)}</span>
                    {f.invoiceUrl && (f.status === "pendente" || f.status === "vencida") && (
                      <a href={f.invoiceUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        Pagar
                      </a>
                    )}
                    {f.ambiente === "simulado" && (f.status === "pendente" || f.status === "vencida") && (
                      <FormAcao
                        acao={simularPagamentoFaturaAcao.bind(null, f.id)}
                        textoBotao="Simular pagamento"
                        textoPendente="…"
                        variante="outline"
                        className="flex items-center gap-2"
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
