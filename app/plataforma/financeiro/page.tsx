import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Receipt,
  Building2,
  Stethoscope,
  DoorOpen,
  Users,
  ExternalLink,
} from "lucide-react";
import { exigirUsuario } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { obterFaturamentoPlataforma } from "@/src/server/plataforma";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "@/app/painel/financeiro/componentes";

const STATUS_CORES: Record<string, { bg: string; text: string; label: string }> = {
  paga: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", label: "Paga" },
  pendente: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-600 dark:text-amber-400", label: "Em aberto" },
  vencida: { bg: "bg-rose-500/10 border-rose-500/20", text: "text-rose-600 dark:text-rose-400", label: "Vencida" },
  estornada: { bg: "bg-muted border-border", text: "text-muted-foreground", label: "Estornada" },
  cancelada: { bg: "bg-muted border-border", text: "text-muted-foreground", label: "Cancelada" },
  erro: { bg: "bg-rose-500/10 border-rose-500/20", text: "text-rose-600 dark:text-rose-400", label: "Erro de envio" },
};

export default async function FinanceiroPlataformaPage() {
  const usuario = await exigirUsuario();
  const { faturas, itensPorFatura, metricas } = await obterFaturamentoPlataforma(usuario.id);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Topo */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <DollarSign className="size-6 text-primary" /> Faturamento Global SaaS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle financeiro consolidado de todas as clínicas, faturas Asaas, overages e add-ons.
          </p>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Faturamento Emitido</span>
            <Receipt className="size-4 text-primary" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">
              {formatarMoeda(metricas.totalFaturadoCentavos)}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">Total de cobranças geradas</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Recebido (Pago)</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatarMoeda(metricas.totalRecebidoCentavos)}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">Confirmado via Asaas</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Aguardando Pagamento</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
              {formatarMoeda(metricas.totalPendenteCentavos)}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">Dentro do prazo de vencimento</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Em Atraso / Carência</span>
            <AlertCircle className="size-4 text-rose-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
              {formatarMoeda(metricas.totalVencidoCentavos)}
            </span>
            <span className="text-xs text-muted-foreground block mt-1">Inadimplência ou aviso prévio</span>
          </div>
        </div>
      </div>

      {/* Breakdown de Receita por Categoria */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Composição da Receita SaaS (Breakdown)</h2>
          <p className="text-xs text-muted-foreground">Distribuição do faturamento por planos base e adicionais comercializados.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl border bg-muted/20 p-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
              <TrendingUp className="size-3.5 text-primary" /> Planos Base
            </span>
            <span className="text-lg font-bold text-foreground block">
              {formatarMoeda(metricas.breakdownCentavos.base || 0)}
            </span>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
              <DoorOpen className="size-3.5 text-primary" /> Salas Extras
            </span>
            <span className="text-lg font-bold text-foreground block">
              {formatarMoeda(metricas.breakdownCentavos.sala_extra || 0)}
            </span>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
              <Users className="size-3.5 text-primary" /> Profs Extras
            </span>
            <span className="text-lg font-bold text-foreground block">
              {formatarMoeda(metricas.breakdownCentavos.profissional_extra || 0)}
            </span>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
              <Building2 className="size-3.5 text-primary" /> Unidades Extras
            </span>
            <span className="text-lg font-bold text-foreground block">
              {formatarMoeda(metricas.breakdownCentavos.unidade_extra || 0)}
            </span>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
              <Stethoscope className="size-3.5 text-primary" /> Prontuário EHR
            </span>
            <span className="text-lg font-bold text-foreground block">
              {formatarMoeda(metricas.breakdownCentavos.prontuario_licenca || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Faturas Globais */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Faturas Recentes de Todos os Espaços</h2>
          <p className="text-xs text-muted-foreground">Histórico unificado com detalhamento de itens faturados e cobranças no Asaas.</p>
        </div>

        {faturas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma fatura gerada no sistema ainda.</p>
        ) : (
          <div className="divide-y rounded-xl border overflow-hidden">
            {faturas.map((f) => {
              const itens = itensPorFatura[f.id] ?? [];
              const status = STATUS_CORES[f.status] ?? STATUS_CORES.pendente;

              return (
                <div key={f.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{f.tenantNome}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Competência: <strong>{rotuloCompetencia(f.competencia)}</strong> · Vence em {formatarDataBr(f.vencimento)}
                        {f.asaasPaymentId && ` · ID Asaas: ${f.asaasPaymentId}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-base font-extrabold tabular-nums text-foreground">
                        {formatarMoeda(f.valorCentavos)}
                      </span>
                      {f.invoiceUrl && (
                        <a
                          href={f.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <ExternalLink className="size-3 text-muted-foreground" /> Ver no Asaas
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Itens discriminados */}
                  {itens.length > 0 && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1">
                      <span className="font-semibold text-foreground/80 block">Composição da fatura:</span>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {itens.map((it) => (
                          <div key={it.id} className="flex justify-between text-muted-foreground">
                            <span>• {it.descricao} {it.quantidade > 1 ? `(${it.quantidade}x)` : ""}</span>
                            <strong className="text-foreground/80">{formatarMoeda(it.valorTotalCentavos)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
