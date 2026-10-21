import Link from "next/link";
import {
  FileSignature,
  Plus,
  Building2,
  Calendar,
  Clock,
  Printer,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  User,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { pode } from "@/src/domain/rbac";
import { formatarGradeHorariosTexto } from "@/src/domain/contratos";
import { listarContratos } from "@/src/server/contratos";

export default async function ContratosPage() {
  const ctx = await obterContextoTenant();
  const contratos = await listarContratos(ctx);

  const podeGerenciar = pode(ctx.role, "contratos.gerenciar");

  const ativos = contratos.filter((c) => c.status === "ativo");
  const receitaMensalCentavos = ativos.reduce((acc, c) => acc + c.valorMensalCentavos, 0);
  const totalFaixasHorarias = ativos.reduce(
    (acc, c) => acc + (c.gradeHorarios ? c.gradeHorarios.length : 0),
    0
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileSignature className="size-6 text-primary" />
            Contratos de Locação de Salas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie a locação fixa de consultórios, termos contratuais e recorrência automática de agenda
          </p>
        </div>

        {podeGerenciar && (
          <Link
            href="/painel/contratos/novo"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
          >
            <Plus className="size-4" /> Novo Contrato
          </Link>
        )}
      </div>

      {/* Cards de Métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Contratos Ativos</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{ativos.length}</span>
              <Building2 className="size-5 text-primary opacity-80" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground">
              {contratos.length} contrato(s) no histórico total
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Receita Mensal de Aluguel Fixo</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span>{formatarMoeda(receitaMensalCentavos)}</span>
              <DollarSign className="size-5 opacity-80" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground">
              Faturamento previsível fixo por mês
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Horários Semanais Reservados</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center justify-between">
              <span>{totalFaixasHorarias} faixas</span>
              <Clock className="size-5 opacity-80" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground">
              Recorrência ativa na agenda dos consultórios
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Contratos */}
      {contratos.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
            <FileSignature className="size-6" />
          </div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            Nenhum contrato cadastrado ainda
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            Crie contratos de aluguel fixo para reservar automaticamente os dias e horários dos profissionais nas salas, sem precisar cadastrar dia a dia.
          </p>
          {podeGerenciar && (
            <div>
              <Link
                href="/painel/contratos/novo"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <Plus className="size-4" /> Criar Primeiro Contrato
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {contratos.map((c) => {
            const isAtivo = c.status === "ativo";
            return (
              <div
                key={c.id}
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                      isAtivo
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <FileSignature className="size-5" />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {c.codigo}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          isAtivo
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {isAtivo ? "Ativo" : "Encerrado"}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        Início em {c.dataInicio}
                        {c.dataFim ? ` até ${c.dataFim}` : " (indeterminado)"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <User className="size-3 text-muted-foreground" />
                        {c.profissional.nome}
                      </span>
                      <span className="text-muted-foreground">
                        {c.profissional.conselho && c.profissional.registro
                          ? `(${c.profissional.conselho} ${c.profissional.registro})`
                          : ""}
                      </span>
                      <span className="text-muted-foreground">locando</span>
                      <span className="font-medium text-primary flex items-center gap-1">
                        <Building2 className="size-3 text-primary" />
                        {c.sala.nome}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                      <Clock className="size-3 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-xl">
                        {formatarGradeHorariosTexto(c.gradeHorarios)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-end justify-between w-full md:w-auto gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
                  <div className="text-left md:text-right">
                    <p className="text-sm font-bold text-foreground">
                      {formatarMoeda(c.valorMensalCentavos)}
                      <span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Vence todo dia {c.diaVencimento}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/painel/agenda?sala=${c.sala.id}&visao=semana&data=${c.dataInicio}`}
                      className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      title="Abrir a agenda desta sala"
                    >
                      <Calendar className="size-3" /> Agenda
                    </Link>

                    <Link
                      href={`/painel/contratos/${c.id}/imprimir`}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Imprimir contrato em folha timbrada"
                      target="_blank"
                    >
                      <Printer className="size-3" /> Imprimir
                    </Link>

                    <Link
                      href={`/painel/contratos/${c.id}`}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                      Detalhes <ChevronRight className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
