import { Building2, Sparkles, CheckCircle2 } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { DIAS_DE_CARENCIA_SAAS, RECURSOS_LIMITADOS, ROTULOS_RECURSO } from "@/src/domain/cobranca";
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

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams?: Promise<{ upgrade?: string }>;
}) {
  const params = await searchParams;
  const upgradeMultiClinica = params?.upgrade === "multi-clinica";

  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "assinatura.ver");
  const { plano, uso, planos, faturas, situacao } = await obterAssinatura(ctx);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura do Salus</h1>
        <p className="text-sm text-muted-foreground">
          Plano {plano?.nome ?? "—"} · {plano ? `${formatarMoeda(plano.precoMensalCentavos)}/mês` : ""}
        </p>
      </div>

      {upgradeMultiClinica && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 shadow-lg animate-in fade-in slide-in-from-top-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                <Building2 className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">
                    Desbloqueie o Módulo Multi-Clínicas
                  </h2>
                  <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                    <Sparkles className="size-3 fill-warning" /> Upgrade
                  </span>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Gerencie mais de uma clínica ou consultório com uma única conta. Alterne facilmente entre espaços, unifique sua visão financeira e compartilhe profissionais com total isolamento de dados.
                </p>
                <div className="pt-2 flex flex-wrap gap-4 text-xs font-medium text-foreground/80">
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3.5" /> Até múltiplas unidades e CNPJs
                  </span>
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3.5" /> Alternância instantânea de contexto
                  </span>
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3.5" /> Relatórios consolidados
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {situacao.estado !== "em_dia" && (
        <Card className={situacao.estado === "suspensa" ? "border-destructive/50" : "border-warning/50"}>
          <CardHeader>
            <CardTitle className={`text-base ${situacao.estado === "suspensa" ? "text-destructive" : "text-warning"}`}>
              {situacao.estado === "suspensa" ? "Espaço só para consulta" : "Fatura em atraso"}
            </CardTitle>
            <CardDescription>
              {situacao.estado === "suspensa"
                ? `A fatura que venceu em ${formatarDataBr(situacao.vencimento)} não foi paga. A equipe continua vendo tudo, mas não consegue marcar nem alterar nada, e o agendamento online está fora do ar. Os lembretes dos pacientes já marcados continuam saindo. Pague abaixo: o espaço volta a funcionar assim que o pagamento for confirmado.`
                : `A fatura venceu em ${formatarDataBr(situacao.vencimento)}. Há ${DIAS_DE_CARENCIA_SAAS} dias de carência: se não for paga até ${formatarDataBr(situacao.suspensaoEm)}, o espaço fica só para consulta até o pagamento.`}
            </CardDescription>
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
          <CardDescription>Cobradas via Asaas no dia 1º de cada mês, com vencimento no dia 10. Pague por PIX, boleto ou cartão. Sem pagamento em {DIAS_DE_CARENCIA_SAAS} dias depois do vencimento, o espaço fica só para consulta.</CardDescription>
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
