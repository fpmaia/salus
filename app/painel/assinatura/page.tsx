import {
  Building2,
  Sparkles,
  CheckCircle2,
  Stethoscope,
  Receipt,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { DIAS_DE_CARENCIA_SAAS, RECURSOS_LIMITADOS, ROTULOS_RECURSO } from "@/src/domain/cobranca";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { obterAssinatura } from "@/src/server/assinatura";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "../financeiro/componentes";
import { alternarLicencaProntuarioAcao, simularPagamentoFaturaAcao, trocarPlanoAcao } from "./actions";

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
  const {
    plano,
    uso,
    planos,
    faturas,
    itensPorFatura,
    profissionaisProntuario,
    projecaoProximoMes,
    situacao,
  } = await obterAssinatura(ctx);

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

      {/* Projeção da Próxima Fatura */}
      {projecaoProximoMes && (
        <Card className="border-primary/20 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="size-4 text-primary" />
                Projeção da Próxima Fatura
              </CardTitle>
              <CardDescription>
                Estimativa detalhada com fechamento no dia 1º, calculada com base no seu plano, uso atual e licenças ativas.
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground block">Previsão total</span>
              <span className="text-2xl font-bold tracking-tight text-primary">
                {formatarMoeda(projecaoProximoMes.valorTotalCentavos)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border divide-y text-sm">
              {projecaoProximoMes.itens.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span className="font-medium text-foreground">{item.descricao}</span>
                    {item.quantidade > 1 && (
                      <span className="text-xs text-muted-foreground">
                        ({item.quantidade}x {formatarMoeda(item.valorUnitarioCentavos)})
                      </span>
                    )}
                  </div>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatarMoeda(item.valorTotalCentavos)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              Recursos excedentes (salas e profissionais) e licenças de prontuário fora do trial são incluídos automaticamente na fatura do mês.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Módulo de Prontuário Eletrônico (EHR) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="size-5 text-primary" />
                Módulo de Prontuário Eletrônico (EHR)
              </CardTitle>
              <CardDescription>
                Ativado aqui, o prontuário do profissional é pago pelo espaço e entra na fatura mensal depois de 15 dias grátis (só na
                primeira ativação). Se o próprio profissional ativar, ele paga a licença direto, sem custo para o espaço.
              </CardDescription>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary self-start sm:self-auto">
              <Sparkles className="size-3.5" />
              {plano && `${formatarMoeda(plano.precoProntuarioCentavos)} / mês por profissional`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {profissionaisProntuario.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado na equipe.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {profissionaisProntuario.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{p.nome}</span>
                      {p.estado === "aguardando_pagamento" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                          Pagamento do profissional vencido
                        </span>
                      ) : p.ativo ? (
                        p.emTrial ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Clock className="size-3" />
                            Degustação gratuita {p.trialFimEm ? `(até ${formatarDataBr(p.trialFimEm.toISOString().slice(0, 10))})` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <ShieldCheck className="size-3" />
                            {p.responsavel === "profissional"
                              ? "Ativa · paga pelo profissional"
                              : `Ativa · na fatura do espaço (${plano ? formatarMoeda(plano.precoProntuarioCentavos) : ""}/mês)`}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Desativado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.estado === "aguardando_pagamento"
                        ? "O profissional consulta o histórico, mas não registra até pagar. Ative aqui para o espaço assumir o custo."
                        : p.ativo
                          ? p.emTrial
                            ? p.responsavel === "espaco"
                              ? "Teste sem custo. Depois do teste, entra na fatura mensal do espaço."
                              : "Teste sem custo. Depois do teste, o próprio profissional paga."
                            : "Acesso liberado a prontuário, prescrição e anexos."
                          : "Sem acesso às ferramentas clínicas do prontuário (o histórico continua guardado)."}
                    </p>
                  </div>
                  <div>
                    {p.ativo && p.estado !== "aguardando_pagamento" ? (
                      <FormAcao
                        acao={alternarLicencaProntuarioAcao.bind(null, p.id, false)}
                        textoBotao="Desativar licença"
                        textoPendente="Desativando…"
                        variante="outline"
                        confirmar={`Desativar a licença de prontuário para ${p.nome}? O profissional perderá acesso à edição do prontuário.`}
                      />
                    ) : (
                      <FormAcao
                        acao={alternarLicencaProntuarioAcao.bind(null, p.id, true)}
                        textoBotao={p.estado === "aguardando_pagamento" ? "Assumir pelo espaço" : "Ativar prontuário"}
                        textoPendente="Ativando…"
                        variante="default"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uso do plano */}
      <Card>
        <CardHeader>
          <CardTitle>Uso do plano</CardTitle>
          <CardDescription>
            Recursos inclusos no plano base. Salas e profissionais podem ser criados além do limite com cobrança proporcional na próxima fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {RECURSOS_LIMITADOS.map((r) => {
            const limite = plano?.limites[r];
            const qtdAtual = uso[r];
            const excedente = limite && qtdAtual > limite ? qtdAtual - limite : 0;
            const proporcao = limite ? Math.min(1, qtdAtual / limite) : 0;
            return (
              <div key={r} className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="capitalize font-medium">{ROTULOS_RECURSO[r]}</span>
                  {excedente > 0 && (
                    <span className="text-xs font-semibold text-primary">
                      +{excedente} extra{excedente > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-muted-foreground text-xs">
                  {qtdAtual} de {limite ?? "ilimitado"} {limite && excedente > 0 ? `(${limite} inclusas + ${excedente} extras)` : "inclusos"}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div
                    className={`h-full rounded-full transition-all ${excedente > 0 ? "bg-primary" : "bg-primary/80"}`}
                    style={{ width: `${proporcao * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Planos Disponíveis */}
      <Card>
        <CardHeader>
          <CardTitle>Planos</CardTitle>
          <CardDescription>
            Os limites mudam na hora e a próxima fatura gerada já usa o novo plano (a fatura do mês já emitida não muda). Para reduzir o
            plano, as unidades ativas precisam caber no novo limite; salas e profissionais a mais viram excedente na fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {planos.map((p) => {
            const ehAtual = p.id === plano?.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-xl border p-5 shadow-sm transition-all ${
                  ehAtual ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/20"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">{p.nome}</span>
                    {ehAtual && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Atual
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold tabular-nums">
                      {formatarMoeda(p.precoMensalCentavos)}
                    </span>
                    <span className="text-xs text-muted-foreground">/mês</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t text-xs text-muted-foreground">
                    <div>
                      <strong className="text-foreground">Incluso: </strong>
                      {RECURSOS_LIMITADOS.map((r) => `${p.limites[r] ?? "∞"} ${ROTULOS_RECURSO[r]}`).join(" · ")}
                    </div>
                    <div className="text-[11px] space-y-0.5 pt-1">
                      <p>• Salas extras: {formatarMoeda(p.precoSalaExtraCentavos)}/mês cada</p>
                      <p>• Profissionais extras: {formatarMoeda(p.precoProfissionalExtraCentavos)}/mês cada</p>
                      <p>• Prontuário EHR: {formatarMoeda(p.precoProntuarioCentavos)}/mês por prof.</p>
                      {p.permiteUnidadeExtra ? (
                        <p>• Unidades extras: {formatarMoeda(p.precoUnidadeExtraCentavos)}/mês cada</p>
                      ) : (
                        <p className="text-muted-foreground/70">• Múltiplas unidades: upgrade para Pro</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pt-4">
                  {ehAtual ? (
                    <span className="block text-center text-xs font-medium text-primary py-2">
                      Seu plano atual
                    </span>
                  ) : (
                    <FormAcao
                      acao={trocarPlanoAcao.bind(null, p.codigo)}
                      textoBotao={p.precoMensalCentavos > (plano?.precoMensalCentavos ?? 0) ? "Fazer upgrade" : "Mudar para este"}
                      textoPendente="Mudar plano…"
                      variante={p.precoMensalCentavos > (plano?.precoMensalCentavos ?? 0) ? "default" : "outline"}
                      className="w-full"
                      confirmar={`Mudar para o plano ${p.nome}?`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Histórico de Faturas */}
      <Card>
        <CardHeader>
          <CardTitle>Faturas</CardTitle>
          <CardDescription>
            Cobradas via Asaas no dia 1º de cada mês, com vencimento no dia 10. Pague por PIX, boleto ou cartão. Sem pagamento em {DIAS_DE_CARENCIA_SAAS} dias depois do vencimento, o espaço fica só para consulta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {faturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {faturas.map((f) => {
                const itensDaFatura = itensPorFatura[f.id] ?? [];
                return (
                  <li key={f.id} className="py-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-foreground">
                          {rotuloCompetencia(f.competencia)}
                        </span>
                        <span className="text-muted-foreground text-xs block">
                          Vence em {formatarDataBr(f.vencimento)} · Status: {STATUS[f.status]}
                          {f.ultimoErro && ` · ${f.ultimoErro}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold tabular-nums text-foreground">
                          {formatarMoeda(f.valorCentavos)}
                        </span>
                        {f.invoiceUrl && (f.status === "pendente" || f.status === "vencida") && (
                          <a
                            href={f.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                          >
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
                      </div>
                    </div>
                    {/* Detalhamento dos itens da fatura */}
                    {itensDaFatura.length > 0 && (
                      <div className="rounded-md bg-muted/40 p-2.5 text-xs space-y-1">
                        <span className="font-medium text-foreground block mb-1">Itens discriminados:</span>
                        {itensDaFatura.map((it) => (
                          <div key={it.id} className="flex justify-between text-muted-foreground">
                            <span>
                              • {it.descricao} {it.quantidade > 1 ? `(${it.quantidade}x)` : ""}
                            </span>
                            <span className="tabular-nums font-medium text-foreground/80">
                              {formatarMoeda(it.valorTotalCentavos)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
