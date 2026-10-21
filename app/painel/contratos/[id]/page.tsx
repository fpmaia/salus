import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSignature,
  Printer,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { pode } from "@/src/domain/rbac";
import { DIAS_SEMANA_NOMES } from "@/src/domain/contratos";
import { obterContrato } from "@/src/server/contratos";
import { BotaoEncerrarContrato } from "./botao-encerrar";

export default async function DetalhesContratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await obterContextoTenant();

  let contrato;
  try {
    contrato = await obterContrato(ctx, id);
  } catch {
    notFound();
  }

  const podeGerenciar = pode(ctx.role, "contratos.gerenciar");
  const isAtivo = contrato.status === "ativo";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/painel/contratos"
            className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Voltar para Contratos"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {contrato.codigo}
              </h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  isAtivo
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {isAtivo ? "Contrato Ativo" : "Contrato Encerrado"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Criado em {new Date(contrato.criadoEm).toLocaleDateString("pt-BR")}
              {contrato.encerradoEm &&
                ` · Encerrado em ${new Date(contrato.encerradoEm).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/painel/agenda?unidade=${contrato.sala.unidadeId}&sala=${contrato.sala.id}&visao=semana&data=${contrato.reservas[0]?.data || contrato.dataInicio}`}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Calendar className="size-4" /> Ver na Agenda
          </Link>

          <Link
            href={`/painel/contratos/${contrato.id}/imprimir`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs hover:bg-muted transition-colors"
          >
            <Printer className="size-4" /> Imprimir Minuta
          </Link>

          {podeGerenciar && isAtivo && (
            <BotaoEncerrarContrato contratoId={contrato.id} codigo={contrato.codigo} />
          )}
        </div>
      </div>

      {/* Grid de Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {/* Profissional */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Profissional Locatário</CardDescription>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <User className="size-4 text-primary" />
              {contrato.profissional.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {contrato.profissional.conselho && contrato.profissional.registro && (
              <p>
                Registro:{" "}
                <span className="font-semibold text-foreground">
                  {contrato.profissional.conselho} {contrato.profissional.registro}
                </span>
              </p>
            )}
            {contrato.profissional.especialidade && (
              <p>Especialidade: {contrato.profissional.especialidade}</p>
            )}
            <p>E-mail: {contrato.profissional.email}</p>
          </CardContent>
        </Card>

        {/* Sala */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Consultório / Sala Locada</CardDescription>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
              <Building2 className="size-4" />
              {contrato.sala.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="size-3.5" /> Agenda automatizada por recorrência
            </p>
          </CardContent>
        </Card>

        {/* Financeiro */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Condições Financeiras</CardDescription>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="size-4" />
              {formatarMoeda(contrato.valorMensalCentavos)}
              <span className="text-xs font-normal text-muted-foreground">/mês</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>Vencimento: Todo dia {contrato.diaVencimento} de cada mês</p>
            <p>
              Taxa consulta:{" "}
              {contrato.cobrancaConsultaTipo === "fixo" && contrato.cobrancaConsultaValorCentavos
                ? `${formatarMoeda(contrato.cobrancaConsultaValorCentavos)} / consulta`
                : contrato.cobrancaConsultaTipo === "percentual" &&
                  contrato.cobrancaConsultaPercentualBp
                ? `${(contrato.cobrancaConsultaPercentualBp / 100).toFixed(1)}% por consulta`
                : "Sem taxa adicional"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grade Semanal de Horários Fixos */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            Grade Semanal de Horários Fixos
          </CardTitle>
          <CardDescription className="text-xs">
            Dias e faixas horárias em que o consultório fica exclusivo para o profissional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {contrato.gradeHorarios.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Calendar className="size-4" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {DIAS_SEMANA_NOMES[item.diaSemana]}
                  </p>
                  <p className="font-mono text-muted-foreground text-[11px]">
                    {item.horaInicio} às {item.horaFim}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="size-4 text-primary shrink-0" />
            <span>
              {contrato.regras.length} regra(s) de recorrência ativa(s). O Salus preenche a agenda
              deste profissional continuamente enquanto o contrato estiver ativo.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Reservas Confirmadas na Agenda */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Reservas Confirmadas na Agenda ({contrato.reservas.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Ocorrências automáticas materializadas para {contrato.sala.nome}
              </CardDescription>
            </div>
            <Link
              href={`/painel/agenda?unidade=${contrato.sala.unidadeId}&sala=${contrato.sala.id}&visao=semana&data=${contrato.reservas[0]?.data || contrato.dataInicio}`}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Abrir na Agenda de Salas →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {contrato.reservas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-5 text-center text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Nenhuma ocorrência gerada na agenda ainda.</p>
              <p>
                As reservas automáticas são criadas a partir de{" "}
                <strong>{contrato.dataInicio}</strong> nos dias e horários estipulados na grade semanal.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {contrato.reservas.map((r) => (
                <Link
                  key={r.id}
                  href={`/painel/agenda?unidade=${contrato.sala.unidadeId}&sala=${contrato.sala.id}&data=${r.data}&reserva=${r.id}`}
                  className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 text-xs transition-all hover:border-primary/50 hover:shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-foreground">{r.data}</span>
                    <span className="inline-flex rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ Reservada
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-muted-foreground text-[11px]">
                    {r.horaInicio} às {r.horaFim}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Termos do Contrato */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileSignature className="size-4 text-primary" />
            Termos e Cláusulas Registradas
          </CardTitle>
          <CardDescription className="text-xs">
            Texto integral do instrumento contratual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[450px] overflow-y-auto rounded-xl border border-border/70 bg-background p-5 text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans shadow-xs">
            {contrato.termosContrato}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
