import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  DoorOpen,
  FileText,
  Plus,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { auditLog, memberships, profissionais, reservasSala, salas, unidades, users } from "@/src/db/schema";
import { withTenant } from "@/src/db/tenant";
import { pode, ROTULOS_ROLE, type Role } from "@/src/domain/rbac";
import { formatarDataBr, minhasProximasReservas } from "@/src/server/reservas";

function ObterIniciais(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function CorBadgeRole(role: Role) {
  switch (role) {
    case "admin":
      return "bg-primary/10 text-primary border-primary/20";
    case "profissional":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "recepcao":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default async function PainelPage() {
  const ctx = await obterContextoTenant();
  const podeVerAuditoria = pode(ctx.role, "auditoria.ver");
  const ehProfissional = pode(ctx.role, "reservas.proprias");
  const podeGerenciarSalas = pode(ctx.role, "salas.gerenciar");
  const podeVerPacientes = pode(ctx.role, "pacientes.ver");

  // Sem filtro por tenant_id de propósito: a RLS restringe ao tenant do contexto.
  const { membros, eventos } = await withTenant(ctx, async (tx) => ({
    membros: await tx
      .select({ id: memberships.id, role: memberships.role, nome: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(memberships.criadoEm),
    eventos: podeVerAuditoria
      ? await tx.select().from(auditLog).orderBy(desc(auditLog.criadoEm)).limit(8)
      : [],
  }));

  const proximas = ehProfissional ? await minhasProximasReservas(ctx) : [];

  const dadosAdmin = ctx.role === "admin"
    ? await withTenant(ctx, async (tx) => {
        const agora = new Date();
        const trintaDiasAtras = new Date(agora.getTime() - 30 * 86_400_000);

        const salasCadastradas = await tx
          .select({ id: salas.id, nome: salas.nome, unidadeNome: unidades.nome })
          .from(salas)
          .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
          .where(and(eq(salas.ativo, true), eq(unidades.ativo, true)))
          .orderBy(salas.nome);

        if (salasCadastradas.length === 0) return null;

        const reservasPeriodo = await tx
          .select({
            id: reservasSala.id,
            salaId: reservasSala.salaId,
            periodo: reservasSala.periodo,
            profissionalId: reservasSala.profissionalId,
            profissionalNome: profissionais.nome,
          })
          .from(reservasSala)
          .innerJoin(profissionais, eq(profissionais.id, reservasSala.profissionalId))
          .where(
            and(
              sql`${reservasSala.periodo} && tstzrange(${trintaDiasAtras.toISOString()}::timestamptz, ${agora.toISOString()}::timestamptz)`,
              inArray(reservasSala.status, ["ativa", "concluida"]),
            ),
          );

        const salasStats = salasCadastradas.map((s) => {
          const res = reservasPeriodo.filter((r) => r.salaId === s.id);
          const totalHoras = res.reduce((acc, r) => {
            const ms = Math.min(r.periodo.fim.getTime(), agora.getTime()) - Math.max(r.periodo.inicio.getTime(), trintaDiasAtras.getTime());
            return acc + Math.max(0, ms / (1000 * 60 * 60));
          }, 0);
          const horasComerciaisEstimadas = 220; // 22 dias úteis * 10h
          const taxaOcupacao = Math.min(100, Math.round((totalHoras / horasComerciaisEstimadas) * 100));
          return {
            id: s.id,
            nome: s.nome,
            unidadeNome: s.unidadeNome,
            horasReservadas: Math.round(totalHoras),
            taxaOcupacao,
            totalReservas: res.length,
          };
        });

        const profissionaisMap = new Map<string, { nome: string; horas: number; reservas: number }>();
        for (const r of reservasPeriodo) {
          const atual = profissionaisMap.get(r.profissionalId) ?? { nome: r.profissionalNome, horas: 0, reservas: 0 };
          const ms = Math.min(r.periodo.fim.getTime(), agora.getTime()) - Math.max(r.periodo.inicio.getTime(), trintaDiasAtras.getTime());
          atual.horas += Math.max(0, ms / (1000 * 60 * 60));
          atual.reservas += 1;
          profissionaisMap.set(r.profissionalId, atual);
        }

        const topProfissionais = [...profissionaisMap.values()]
          .map((p) => ({ ...p, horas: Math.round(p.horas) }))
          .sort((a, b) => b.horas - a.horas)
          .slice(0, 5);

        return { salasStats, topProfissionais };
      })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Banner de Boas-Vindas & Ações Rápidas */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-primary/5 p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Olá, {ctx.usuario.nome.split(" ")[0]}!
            </h1>
            <span className="inline-flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bem-vindo ao painel operacional do espaço{" "}
            <span className="font-medium text-foreground">{ctx.tenantNome}</span>.
          </p>
        </div>

        {/* Atalhos Rápidos Contextuais */}
        <div className="flex flex-wrap items-center gap-2">
          {ehProfissional && (
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs gap-1.5">
              <Link href="/painel/agenda">
                <Plus className="size-4" />
                Nova Reserva
              </Link>
            </Button>
          )}

          {podeVerPacientes && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/painel/pacientes">
                <Users className="size-4" />
                Pacientes
              </Link>
            </Button>
          )}

          {podeGerenciarSalas && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/painel/unidades">
                <Building2 className="size-4" />
                Gerenciar Salas
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Métricas / KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs glow-card">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Suas Reservas</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">
              {ehProfissional ? proximas.length : "Ativa"}
            </span>
            <span className="text-xs text-muted-foreground">
              {ehProfissional ? "agendamentos futuros" : "visão geral"}
            </span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs glow-card">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Equipe do Espaço</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">
              {membros.length}
            </span>
            <span className="text-xs text-muted-foreground">membros ativos</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs glow-card">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Prevenção de Conflito</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">
              100%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Garantido pelo sistema
            </span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs glow-card">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Auditoria do Sistema</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">
              {eventos.length > 0 ? eventos.length : "Ativa"}
            </span>
            <span className="text-xs text-muted-foreground">ações rastreadas</span>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal em Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Próximas Reservas (para Profissionais) */}
        {ehProfissional && (
          <Card className="md:col-span-2 border-border/70 bg-card/90 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
                  <CalendarDays className="size-5 text-primary" />
                  Minhas Próximas Reservas
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Horários reservados para seus atendimentos clínicos.
                </CardDescription>
              </div>

              <Button asChild variant="outline" size="sm" className="gap-1 text-xs">
                <Link href="/painel/agenda">
                  Abrir agenda completa
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>

            <CardContent>
              {proximas.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 py-8 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                    <DoorOpen className="size-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Nenhuma reserva futura encontrada</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Você ainda não reservou salas para os próximos dias. Acesse a agenda para escolher seus horários.
                  </p>
                  <Button asChild size="sm" className="mt-4 gap-1.5">
                    <Link href="/painel/agenda">
                      <Plus className="size-4" />
                      Reservar Sala Agora
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {proximas.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm transition-colors hover:bg-muted/30 rounded-lg px-2 -mx-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs">
                          {r.horaInicio}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {formatarDataBr(r.data)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({r.horaInicio} às {r.horaFim})
                            </span>
                            {r.recorrente && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                <Repeat className="size-2.5" />
                                semanal
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {r.salaNome} • {r.unidadeNome}
                          </span>
                        </div>
                      </div>

                      <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                        <Link href={`/painel/agenda?data=${r.data}&reserva=${r.id}`}>
                          Ver na agenda
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Gráficos de Ocupação e Uso das Salas (Apenas Admin) */}
      {dadosAdmin && dadosAdmin.salasStats.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gráfico 1: Ocupação por Sala */}
          <Card className="border-border/70 bg-card/90 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" />
                  Taxa de Ocupação das Salas
                </CardTitle>
                <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                  Últimos 30 dias
                </span>
              </div>
              <CardDescription className="text-xs">
                Porcentagem de tempo comercial com salas reservadas ou em atendimento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              {dadosAdmin.salasStats.map((s) => (
                <div key={s.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {s.nome} <span className="text-muted-foreground font-normal">({s.unidadeNome})</span>
                    </span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {s.taxaOcupacao}% <span className="text-muted-foreground font-normal text-[11px]">({s.horasReservadas}h reservadas)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s.taxaOcupacao >= 70
                          ? "bg-emerald-500"
                          : s.taxaOcupacao >= 40
                            ? "bg-primary"
                            : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.max(4, s.taxaOcupacao)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Gráfico 2: Ranking de Uso por Profissional */}
          <Card className="border-border/70 bg-card/90 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  Top Profissionais por Utilização
                </CardTitle>
                <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                  Últimos 30 dias
                </span>
              </div>
              <CardDescription className="text-xs">
                Profissionais com maior volume de horas locadas e consultas no período.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-1">
              {dadosAdmin.topProfissionais.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma reserva registrada nos últimos 30 dias.
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {dadosAdmin.topProfissionais.map((p, idx) => (
                    <div key={p.nome} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            idx === 0
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                              : idx === 1
                                ? "bg-slate-300/30 text-slate-700 dark:text-slate-300 border border-slate-400/40"
                                : idx === 2
                                  ? "bg-amber-700/20 text-amber-800 dark:text-amber-400 border border-amber-700/40"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-medium text-foreground">{p.nome}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{p.reservas} {p.reservas === 1 ? "reserva" : "reservas"}</span>
                        <span className="font-semibold text-foreground tabular-nums">{p.horas}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

        {/* Membros da Equipe */}
        <Card className="border-border/70 bg-card/90 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="size-5 text-primary" />
                Equipe & Usuários
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Profissionais e operadores com acesso a este espaço.
              </CardDescription>
            </div>

            {pode(ctx.role, "profissionais.gerenciar") && (
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/painel/profissionais">
                  Gerenciar
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            )}
          </CardHeader>

          <CardContent>
            <div className="divide-y divide-border/50">
              {membros.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-muted/30 rounded-lg px-2 -mx-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted font-bold text-xs text-muted-foreground">
                      {ObterIniciais(m.nome)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground leading-tight">{m.nome}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CorBadgeRole(
                      m.role
                    )}`}
                  >
                    {ROTULOS_ROLE[m.role]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Auditoria & Eventos Recentes */}
        {podeVerAuditoria && (
          <Card className="border-border/70 bg-card/90 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" />
                  Auditoria de Atividades
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Registro imutável de eventos operacionais recentes.
                </CardDescription>
              </div>

              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Tempo real
              </span>
            </CardHeader>

            <CardContent>
              {eventos.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum evento registrado recentemente.
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {eventos.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between py-2.5 text-xs transition-colors hover:bg-muted/30 rounded-lg px-2 -mx-2"
                    >
                      <span className="font-mono text-[11px] font-semibold text-foreground/90 bg-muted/60 px-2 py-0.5 rounded">
                        {e.acao}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {e.criadoEm.toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
