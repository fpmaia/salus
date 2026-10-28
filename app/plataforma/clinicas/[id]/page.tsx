import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  DoorOpen,
  Users,
  Stethoscope,
  Clock,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exigirUsuario } from "@/src/auth/sessao";
import { primeiraCompetenciaCobrada } from "@/src/domain/cobranca";
import { hojeNoFuso } from "@/src/domain/tempo";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { obterDetalhesClinicaPlataforma } from "@/src/server/plataforma";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "@/app/painel/financeiro/componentes";
import { definirFimDoTesteAcao } from "@/app/plataforma/convites/actions";

const STATUS_FATURA: Record<string, { bg: string; text: string; label: string }> = {
  paga: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", label: "Paga" },
  pendente: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-600 dark:text-amber-400", label: "Em aberto" },
  vencida: { bg: "bg-rose-500/10 border-rose-500/20", text: "text-rose-600 dark:text-rose-400", label: "Vencida" },
  estornada: { bg: "bg-muted border-border", text: "text-muted-foreground", label: "Estornada" },
  cancelada: { bg: "bg-muted border-border", text: "text-muted-foreground", label: "Cancelada" },
  erro: { bg: "bg-rose-500/10 border-rose-500/20", text: "text-rose-600 dark:text-rose-400", label: "Erro de envio" },
};

export default async function DetalhesClinicaPlataformaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tenantId } = await params;
  const usuario = await exigirUsuario();

  let dados;
  try {
    dados = await obterDetalhesClinicaPlataforma(usuario.id, tenantId);
  } catch {
    notFound();
  }

  const { tenant, recursos, membros, faturas, itensPorFatura } = dados;

  const salasCount = recursos.salas.length;
  const salasLimite = (tenant.limites as Record<string, number>).salas ?? 0;
  const salasExtras = salasLimite > 0 && salasCount > salasLimite ? salasCount - salasLimite : 0;

  const profsCount = recursos.profissionais.length;
  const profsLimite = (tenant.limites as Record<string, number>).profissionais ?? 0;
  const profsExtras = profsLimite > 0 && profsCount > profsLimite ? profsCount - profsLimite : 0;

  const unidadesCount = recursos.unidades.length;
  const unidadesLimite = (tenant.limites as Record<string, number>).unidades ?? 1;
  const unidadesExtras = unidadesCount > unidadesLimite ? unidadesCount - unidadesLimite : 0;

  const prontuariosEmTrial = recursos.profissionais.filter(
    (p) => p.licencaProntuario.ativo && p.licencaProntuario.emTrial,
  ).length;

  const prontuariosFaturaveis = recursos.profissionais.filter(
    (p) => p.licencaProntuario.ativo && !p.licencaProntuario.emTrial,
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Botão Voltar e Cabeçalho */}
      <div>
        <Link
          href="/plataforma/clinicas"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Voltar para Todas as Clínicas
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{tenant.nome}</h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                  tenant.status === "ativo"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                }`}
              >
                {tenant.status === "ativo" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                {tenant.status === "ativo" ? "Ativa" : "Suspensa"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Documento: <strong>{tenant.documento}</strong> · Cadastrada em {formatarDataBr(tenant.criadoEm.toISOString().slice(0, 10))}
            </p>
          </div>
        </div>
      </div>

      {/* Grid de Informações: Plano e Resumo de Uso */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Card do Plano */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Plano Contratado</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {tenant.planoNome}
            </span>
          </div>

          <div>
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              {formatarMoeda(tenant.planoPrecoMensalCentavos)}
            </span>
            <span className="text-xs text-muted-foreground"> / mês base</span>
          </div>

          <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Sala extra:</span>
              <strong className="text-foreground">{formatarMoeda(tenant.precoSalaExtraCentavos)}/mês</strong>
            </div>
            <div className="flex justify-between">
              <span>Profissional extra:</span>
              <strong className="text-foreground">{formatarMoeda(tenant.precoProfissionalExtraCentavos)}/mês</strong>
            </div>
            <div className="flex justify-between">
              <span>Unidade extra:</span>
              <strong className="text-foreground">
                {tenant.permiteUnidadeExtra ? `${formatarMoeda(tenant.precoUnidadeExtraCentavos)}/mês` : "Não permite"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Prontuário EHR:</span>
              <strong className="text-foreground">{formatarMoeda(tenant.precoProntuarioCentavos)}/mês</strong>
            </div>
          </div>

          {/* Teste grátis: estender, encerrar ou liberar */}
          <div className="space-y-2 border-t pt-3 text-xs">
            <p className="font-semibold text-foreground">Teste grátis</p>
            <p className="text-muted-foreground">
              {tenant.testeAte
                ? `${tenant.testeAte >= hojeNoFuso("America/Sao_Paulo") ? "Em teste" : "Teste terminou"} em ${formatarDataBr(tenant.testeAte)}. Primeira fatura: ${rotuloCompetencia(primeiraCompetenciaCobrada(tenant.testeAte))}.`
                : "Sem teste: cobrança mensal normal."}
            </p>
            <FormAcao acao={definirFimDoTesteAcao.bind(null, tenant.id)} textoBotao="Salvar teste" variante="outline" className="flex flex-col gap-2">
              <Label htmlFor="teste-ate" className="text-xs">
                Teste até
              </Label>
              <Input id="teste-ate" name="testeAte" type="date" defaultValue={tenant.testeAte ?? ""} />
              {tenant.testeAte && (
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" name="encerrar" /> Encerrar o teste (cobra a partir do mês atual)
                </label>
              )}
            </FormAcao>
          </div>
        </div>

        {/* Uso vs Limites */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4 md:col-span-2">
          <h2 className="text-base font-bold text-foreground">Recursos Utilizados vs Limites</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="size-4 text-primary" /> Unidades
                </span>
                {unidadesExtras > 0 && (
                  <span className="text-[11px] font-bold text-primary">+{unidadesExtras} extra</span>
                )}
              </div>
              <span className="text-2xl font-bold text-foreground block">
                {unidadesCount} <span className="text-xs font-normal text-muted-foreground">/ {unidadesLimite} inclusa</span>
              </span>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <DoorOpen className="size-4 text-primary" /> Salas
                </span>
                {salasExtras > 0 && (
                  <span className="text-[11px] font-bold text-primary">+{salasExtras} extras</span>
                )}
              </div>
              <span className="text-2xl font-bold text-foreground block">
                {salasCount} <span className="text-xs font-normal text-muted-foreground">/ {salasLimite} inclusas</span>
              </span>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-4 text-primary" /> Profissionais
                </span>
                {profsExtras > 0 && (
                  <span className="text-[11px] font-bold text-primary">+{profsExtras} extras</span>
                )}
              </div>
              <span className="text-2xl font-bold text-foreground block">
                {profsCount} <span className="text-xs font-normal text-muted-foreground">/ {profsLimite} inclusos</span>
              </span>
            </div>
          </div>

          <div className="rounded-xl border bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Stethoscope className="size-5 text-primary shrink-0" />
              <div>
                <strong className="text-foreground block">Módulo de Prontuário Eletrônico (EHR)</strong>
                <span className="text-muted-foreground">
                  {prontuariosFaturaveis} com licença faturável · {prontuariosEmTrial} em degustação gratuita (trial de 15 dias)
                </span>
              </div>
            </div>
            <span className="font-bold text-primary tabular-nums">
              {formatarMoeda(prontuariosFaturaveis * tenant.precoProntuarioCentavos)} / mês
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Profissionais e Status de Prontuário */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Profissionais e Licenças de Prontuário</h2>
          <p className="text-xs text-muted-foreground">Profissionais de saúde cadastrados e estado de liberação do prontuário eletrônico.</p>
        </div>

        {recursos.profissionais.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum profissional cadastrado na clínica.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {recursos.profissionais.map((p) => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{p.nome}</span>
                    {p.especialidade && (
                      <span className="text-xs text-muted-foreground">({p.especialidade})</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    {p.registro ? `Registro: ${p.registro}` : "Sem registro informado"}
                  </span>
                </div>

                <div>
                  {p.licencaProntuario.ativo ? (
                    p.licencaProntuario.emTrial ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Clock className="size-3" /> Degustação Gratuita (até {p.licencaProntuario.trialFimEm ? formatarDataBr(p.licencaProntuario.trialFimEm.toISOString().slice(0, 10)) : ""})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                        <ShieldCheck className="size-3" /> Licença EHR Ativa ({formatarMoeda(tenant.precoProntuarioCentavos)}/mês)
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Sem Prontuário
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Membros / Acessos à Clínica */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Equipe e Usuários Vinculados</h2>
          <p className="text-xs text-muted-foreground">Membros com acesso ao painel desta clínica.</p>
        </div>

        <div className="divide-y rounded-xl border">
          {membros.map((m) => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{m.userName}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground uppercase">
                    {m.role}
                  </span>
                  {m.userBanned && (
                    <span className="rounded-full bg-rose-500/10 text-rose-600 px-2 py-0.5 text-[11px] font-bold">
                      Banido
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground block">{m.userEmail}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Membro desde {formatarDataBr(m.criadoEm.toISOString().slice(0, 10))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico Financeiro da Clínica */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Histórico de Faturas SaaS</h2>
          <p className="text-xs text-muted-foreground">Cobranças emitidas via Asaas para esta clínica.</p>
        </div>

        {faturas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma fatura emitida para esta clínica ainda.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {faturas.map((f) => {
              const itens = itensPorFatura[f.id] ?? [];
              const status = STATUS_FATURA[f.status] ?? STATUS_FATURA.pendente;

              return (
                <div key={f.id} className="p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">
                          Competência: {rotuloCompetencia(f.competencia)}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Vence em {formatarDataBr(f.vencimento)}
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
                      <span className="font-semibold text-foreground/80 block">Itens da cobrança:</span>
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
