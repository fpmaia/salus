import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { exigirUsuario } from "@/src/auth/sessao";
import {
  listarAuditoriaPlataforma,
  listarClinicasPlataforma,
  obterMetricasPlataforma,
} from "@/src/server/plataforma";

export default async function PlataformaVisaoGeralPage() {
  const usuario = await exigirUsuario();
  const [metricas, clinicas, auditoria] = await Promise.all([
    obterMetricasPlataforma(usuario.id),
    listarClinicasPlataforma(usuario.id),
    listarAuditoriaPlataforma(usuario.id, 8),
  ]);

  const formatarMoeda = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      {/* Topo Boas-vindas */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Painel Central da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de todas as clínicas, receita SaaS e usuários ativos no ecossistema Salus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Banco de Dados Saudável
          </span>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card MRR */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              MRR SaaS Estimado
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-foreground">
              {formatarMoeda(metricas.mrrEstimadoCentavos)}
            </span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              /mês em assinaturas ativas
            </span>
          </div>
        </div>

        {/* Card Clínicas */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Espaços & Clínicas
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <Building2 className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-foreground">
              {metricas.totalClinicas}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              {metricas.clinicasAtivas} ativas
            </span>
            {metricas.clinicasSuspensas > 0 && (
              <span className="text-xs text-destructive font-semibold">
                ({metricas.clinicasSuspensas} suspensas)
              </span>
            )}
          </div>
        </div>

        {/* Card Usuários */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Usuários Totais
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-foreground">
              {metricas.totalUsuarios}
            </span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              contas registradas globalmente
            </span>
          </div>
        </div>

        {/* Card Profissionais */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Profissionais de Saúde
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-foreground">
              {metricas.totalProfissionais}
            </span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              profissionais em atendimento
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Lista de Clínicas Recentes (2 colunas) */}
        <div className="lg:col-span-2 rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
          <div className="border-b border-border/60 bg-muted/20 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Clínicas Cadastradas</h2>
              <p className="text-xs text-muted-foreground">Últimos espaços ativados no Salus.</p>
            </div>
            <Link
              href="/plataforma/clinicas"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Ver todas ({clinicas.length}) <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/40">
            {clinicas.slice(0, 6).map((clinica) => (
              <div
                key={clinica.id}
                className="flex items-center justify-between p-4 sm:px-6 hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{clinica.nome}</span>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                        clinica.status === "ativo"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-destructive/10 text-destructive border border-destructive/20"
                      }`}
                    >
                      {clinica.status === "ativo" ? "Ativa" : "Suspensa"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Plano: <strong>{clinica.planoNome}</strong> ({formatarMoeda(clinica.planoPrecoCentavos)}/mês)</span>
                    <span>•</span>
                    <span>{clinica.membrosCount} membros</span>
                    <span>•</span>
                    <span>{clinica.salasCount} salas</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-muted-foreground">
                    Criada em {new Date(clinica.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auditoria Recente da Plataforma (1 coluna) */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
          <div className="border-b border-border/60 bg-muted/20 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Auditoria Global</h2>
              <p className="text-xs text-muted-foreground">Eventos administrativos.</p>
            </div>
            <Link
              href="/plataforma/auditoria"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/40">
            {auditoria.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum evento registrado ainda.
              </div>
            ) : (
              auditoria.map((item) => (
                <div key={item.id} className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground font-mono text-[11px]">
                      {item.acao}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.criadoEm).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground block truncate">
                    Por: {item.userNome || item.userEmail || "Sistema"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
