import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { ROTULOS_MODELO } from "@/src/domain/financeiro";
import {
  competenciaAtual,
  competenciaSchema,
  ocupacaoSalas,
  receitaPorUnidade,
  resumoCompetencia,
} from "@/src/server/financeiro";
import { listarUnidades } from "@/src/server/unidades";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarPercentual } from "@/src/domain/dinheiro";
import { pode } from "@/src/domain/rbac";
import { obterConfigCobranca } from "@/src/server/cobrancas";
import { fecharTodosAcao, gerarTokenWebhookAcao, reprocessarAcao, salvarConfigCobrancaAcao } from "./actions";
import { BotaoTokenWebhook } from "./token-webhook";
import { NavCompetencia, rotuloCompetencia, Saldo } from "./componentes";

export default async function FinanceiroPage({ searchParams }: PageProps<"/painel/financeiro">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "financeiro.ver");
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  const competencia = informada?.success ? informada.data : await competenciaAtual(ctx);
  const unidades = (await listarUnidades(ctx)).filter((u) => u.ativo);
  const unidade = unidades.find((u) => u.id === brutos.unidade) ?? unidades[0];

  const [resumo, receita, ocupacao] = await Promise.all([
    resumoCompetencia(ctx, competencia),
    receitaPorUnidade(ctx, competencia),
    unidade ? ocupacaoSalas(ctx, unidade.id, competencia) : Promise.resolve([]),
  ]);
  const configurar = pode(ctx.role, "tenant.configurar");
  const configCobranca = configurar ? await obterConfigCobranca(ctx) : null;
  const totalReceita = receita.reduce((acc, r) => acc + r.receitaCentavos, 0);
  const aReceber = resumo.filter((p) => p.saldoAcumulado > 0).reduce((acc, p) => acc + p.saldoAcumulado, 0);
  const aPagar = resumo.filter((p) => p.saldoAcumulado < 0).reduce((acc, p) => acc - p.saldoAcumulado, 0);
  const c = competencia.slice(0, 7);
  // Fechamento em lote: mês já terminado e ainda com profissionais em aberto.
  const abertos = resumo.filter((p) => !p.fechado).length;
  const podeFecharTodos = pode(ctx.role, "financeiro.fechar") && competencia < (await competenciaAtual(ctx)) && abertos > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Mês de {rotuloCompetencia(competencia)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NavCompetencia competencia={competencia} href={(x) => `/painel/financeiro?competencia=${x}`} />
          {pode(ctx.role, "financeiro.reprocessar") && (
            <FormAcao
              acao={reprocessarAcao.bind(null, competencia)}
              textoBotao="Recalcular mês"
              textoPendente="Recalculando…"
              variante="outline"
              className="flex flex-wrap items-center gap-2"
            />
          )}
          <Button asChild variant="outline">
            <a href={`/api/financeiro/fechamento?competencia=${competencia.slice(0, 7)}`}>Exportar CSV</a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Receita de locação no mês</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatarMoeda(totalReceita)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>A receber dos profissionais (acumulado)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatarMoeda(aReceber)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>A repassar aos profissionais (acumulado)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatarMoeda(aPagar)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profissionais</CardTitle>
          <CardDescription>Movimento do mês e saldo acumulado até o fim do mês.</CardDescription>
          {podeFecharTodos && (
            <FormAcao
              acao={fecharTodosAcao.bind(null, competencia)}
              textoBotao={`Fechar o mês de todos (${abertos} em aberto)`}
              textoPendente="Fechando…"
              confirmar={`Fechar ${rotuloCompetencia(competencia)} de ${abertos} profissional(is)? Depois de fechado, o mês não muda mais.`}
              className="mt-2 flex flex-wrap items-center gap-2"
            />
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-2 font-medium">Profissional</th>
                <th className="py-2 pr-2 font-medium">Acordo</th>
                <th className="py-2 pr-2 text-right font-medium">Débitos</th>
                <th className="py-2 pr-2 text-right font-medium">Créditos</th>
                <th className="py-2 pr-2 text-right font-medium">Saldo acumulado</th>
                <th className="py-2 font-medium">Mês</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2 pr-2">
                    <Link href={`/painel/financeiro/${p.id}?competencia=${c}`} className="text-primary underline-offset-4 hover:underline">
                      {p.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    {p.modelo ? ROTULOS_MODELO[p.modelo] : <span className="text-destructive">Sem acordo</span>}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatarMoeda(p.debitos)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatarMoeda(p.creditos)}</td>
                  <td className="py-2 pr-2 text-right">
                    <Saldo centavos={p.saldoAcumulado} />
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{p.fechado ? "Fechado" : "Aberto"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receita por unidade</CardTitle>
            <CardDescription>Locação líquida de estornos. Mensalidades não têm unidade.</CardDescription>
          </CardHeader>
          <CardContent>
            {receita.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem receita no mês.</p>
            ) : (
              <ul className="divide-y text-sm">
                {receita.map((r) => (
                  <li key={r.unidade ?? "sem"} className="flex justify-between py-2">
                    <span>{r.unidade ?? "Mensalidades"}</span>
                    <span className="tabular-nums">{formatarMoeda(r.receitaCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ocupação das salas</CardTitle>
            <CardDescription>Horas reservadas ÷ horas de funcionamento no mês.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unidades.length > 1 && (
              <form action="/painel/financeiro" className="flex gap-2">
                <input type="hidden" name="competencia" value={c} />
                <NativeSelect name="unidade" defaultValue={unidade?.id} aria-label="Unidade">
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="submit" variant="outline">
                  Ver
                </Button>
              </form>
            )}
            {ocupacao.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem salas ativas.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {ocupacao.map((o) => (
                  <li key={o.id} className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span>{o.nome}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {Math.round(o.minutosReservados / 60)}h / {Math.round(o.minutosAbertos / 60)}h · {(o.ocupacao * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, o.ocupacao * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {configurar && (
        <Card>
          <CardHeader>
            <CardTitle>Cobrança automática (Asaas)</CardTitle>
            <CardDescription>
              Conta Asaas do próprio espaço para cobrar os profissionais por PIX/boleto. A chave de API é guardada cifrada e
              nunca é exibida.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormAcao acao={salvarConfigCobrancaAcao} textoBotao="Salvar">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cc-ambiente">Ambiente</Label>
                  <NativeSelect id="cc-ambiente" name="ambiente" defaultValue={configCobranca?.ambiente ?? "simulado"}>
                    <option value="simulado">Simulado (nada é cobrado)</option>
                    <option value="sandbox">Sandbox do Asaas (testes)</option>
                    <option value="producao">Produção</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="cc-chave">Chave de API {configCobranca?.apiKeyConfigurada && "(configurada — deixe vazio para manter)"}</Label>
                  <Input id="cc-chave" name="apiKey" type="password" autoComplete="off" placeholder="chave da conta Asaas" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cc-dias">Prazo de vencimento (dias)</Label>
                  <Input id="cc-dias" name="diasVencimento" type="number" min={1} max={60} defaultValue={configCobranca?.diasVencimento ?? 5} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cc-multa">Multa por atraso (%)</Label>
                  <Input id="cc-multa" name="multa" inputMode="decimal" placeholder="padrão da conta" defaultValue={configCobranca?.multaBp ? formatarPercentual(configCobranca.multaBp).replace("%", "") : ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cc-juros">Juros ao mês (%)</Label>
                  <Input id="cc-juros" name="juros" inputMode="decimal" placeholder="padrão da conta" defaultValue={configCobranca?.jurosMesBp ? formatarPercentual(configCobranca.jurosMesBp).replace("%", "") : ""} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ativo" defaultChecked={configCobranca?.ativo ?? false} /> Cobrança automática ativa
              </label>
            </FormAcao>
            {configCobranca && configCobranca.ambiente !== "simulado" && (
              <BotaoTokenWebhook acao={gerarTokenWebhookAcao} configurado={configCobranca.webhookConfigurado} />
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
