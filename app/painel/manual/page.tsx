import Link from "next/link";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  DollarSign,
  Building2,
  UserCheck,
  User,
  ShieldCheck,
  Clock,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
  Smartphone,
  CreditCard,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ROTULOS_ROLE } from "@/src/domain/rbac";

export default async function ManualPage() {
  const ctx = await obterContextoTenant();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      {/* Hero do Manual */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-primary/10 via-background to-muted/30 p-6 sm:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                <BookOpen className="size-3.5" /> Manual Oficial Salus
              </span>
              <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 text-xs text-muted-foreground">
                Versão 2.4 · Guia Operacional
              </span>
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Guia Prático e Manual de Uso
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Aprenda como tirar o máximo proveito do Salus: desde a locação mensal de salas e check-in ágil de pacientes até o registro simplificado de pagamentos e repasses automáticos.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0 sm:self-center">
            <div className="rounded-2xl border border-border/80 bg-background/90 p-4 shadow-sm backdrop-blur-md">
              <p className="text-xs text-muted-foreground">Seu perfil atual:</p>
              <p className="text-base font-bold text-foreground flex items-center gap-2 mt-0.5">
                <User className="size-4 text-primary" /> {ROTULOS_ROLE[ctx.role]}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Espaço: <span className="font-medium text-foreground">{ctx.tenantNome}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sumário Rápido de Atalhos */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <a
          href="#salas-contratos"
          className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Módulo 1</p>
              <h3 className="font-heading text-sm font-semibold text-foreground">Salas & Contratos</h3>
            </div>
          </div>
          <span className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
            Ver detalhes <ChevronRight className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </a>

        <a
          href="#agenda-checkin"
          className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Módulo 2</p>
              <h3 className="font-heading text-sm font-semibold text-foreground">Agenda & Check-in</h3>
            </div>
          </div>
          <span className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
            Ver detalhes <ChevronRight className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </a>

        <a
          href="#pagamentos-repasses"
          className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <DollarSign className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Módulo 3</p>
              <h3 className="font-heading text-sm font-semibold text-foreground">Pagamento & Repasses</h3>
            </div>
          </div>
          <span className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Ver detalhes <ChevronRight className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </a>

        <a
          href="#link-profissional"
          className="group flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-colors">
              <Smartphone className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Módulo 4</p>
              <h3 className="font-heading text-sm font-semibold text-foreground">Link Pessoal & Perfil</h3>
            </div>
          </div>
          <span className="mt-3 flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
            Ver detalhes <ChevronRight className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </a>
      </div>

      {/* SEÇÃO 1: SALAS E CONTRATOS FIXOS */}
      <section id="salas-contratos" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            1
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Gestão de Salas e Contratos de Aluguel Fixo
            </h2>
            <p className="text-xs text-muted-foreground">
              Como configurar as salas da clínica e estabelecer contratos mensais com profissionais
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Explicação dos Modelos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" /> Modelos de Cobrança Suportados
              </CardTitle>
              <CardDescription>
                A clínica pode lucrar por diferentes modalidades para cada sala ou profissional:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Building2 className="size-4 text-primary" />
                  <span>Aluguel Fixo Mensal (Sala Exclusiva)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  O profissional fecha um contrato com a clínica pagando um valor fixo por mês. Ele ganha exclusividade da sala e seus horários já ficam pré-reservados na agenda.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Percent className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Cobrança por Consulta (Percentual ou Valor Fixo)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  A clínica retém uma taxa sobre cada consulta realizada (ex: 20% do valor do atendimento ou R$ 30,00 fixos por paciente).
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Sparkles className="size-4 text-amber-500" />
                  <span>Modelo Misto (Aluguel Fixo + Taxa por Consulta)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Combinação dos dois: o profissional paga uma mensalidade básica pelo espaço mais uma pequena taxa por atendimento.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mockup da Interface */}
          <Card className="border-primary/20 shadow-sm overflow-hidden flex flex-col justify-between">
            <CardHeader className="bg-muted/30 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Exemplo de Configuração de Sala
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                  Ativo no Salus
                </span>
              </div>
              <CardTitle className="text-base text-foreground">Consultório 03 · Psicologia</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Modelo de cobrança:</span>
                  <span className="font-semibold text-foreground">Sala Fixa Mensal</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Profissional locatário:</span>
                  <span className="font-semibold text-primary">Dr. Felipe Maia (Psicólogo)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Aluguel mensal fixo:</span>
                  <span className="font-bold text-foreground">R$ 1.800,00 / mês</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Taxa adicional por consulta:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">R$ 15,00 / consulta</span>
                </div>
              </div>

              <div className="rounded-xl bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Impacto Automático:</strong> Os horários vagos desta sala já ficam livres para agendamento direto no link pessoal do profissional locatário!
                </span>
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <Link
                  href="/painel/contratos"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Ir para Contratos <ExternalLink className="size-3" />
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link
                  href="/painel/unidades"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Ir para Unidades e Salas <ExternalLink className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SEÇÃO 2: AGENDA DE SALAS & CHECK-IN */}
      <section id="agenda-checkin" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
            2
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Agenda de Salas & Recepção em Tempo Real
            </h2>
            <p className="text-xs text-muted-foreground">
              Monitoramento instantâneo da clínica e check-in ágil quando o paciente chega
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="size-4 text-blue-600" /> Panorama Geral das Salas (Hoje)
            </CardTitle>
            <CardDescription>
              Tanto o Administrador quanto a Secretaria possuem no topo da tela uma visão panorâmica ao vivo de todas as salas:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Grid dos Cards de Salas */}
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Sala 01 · Terapia</span>
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <span className="size-2 rounded-full bg-primary animate-pulse" /> Em Atendimento
                  </span>
                </div>
                <p className="text-muted-foreground">Paciente: Maria Eduarda Silva</p>
                <p className="text-muted-foreground">Com: Dra. Camila Santos</p>
                <div className="pt-1 text-[11px] text-primary font-medium">Término previsto: 15:45</div>
              </div>

              <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Sala 02 · Odonto</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5" /> Reservada (Vaga)
                  </span>
                </div>
                <p className="text-muted-foreground">Locatário fixo: Dr. Carlos Mendes</p>
                <p className="text-muted-foreground">Aguardando marcação do paciente</p>
                <div className="pt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">Disponível no link público</div>
              </div>

              <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Sala 03 · Avaliação</span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" /> Sala Livre
                  </span>
                </div>
                <p className="text-muted-foreground">Sem atendimentos agendados agora</p>
                <p className="text-muted-foreground">Próximo agendamento: 17:00</p>
                <div className="pt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Pronta para uso</div>
              </div>
            </div>

            {/* Fluxo de Check-in */}
            <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                Como a Secretaria Realiza o Check-in
              </h3>
              <ol className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
                <li className="flex flex-col gap-1 rounded-xl bg-background p-3 border border-border/60">
                  <span className="font-bold text-foreground">1. Paciente Chega</span>
                  <span>O paciente se apresenta na recepção física da clínica.</span>
                </li>
                <li className="flex flex-col gap-1 rounded-xl bg-background p-3 border border-border/60">
                  <span className="font-bold text-foreground">2. Clique em &quot;✓ Check-in&quot;</span>
                  <span>A secretária clica no botão verde esmeralda na linha do atendimento.</span>
                </li>
                <li className="flex flex-col gap-1 rounded-xl bg-background p-3 border border-border/60">
                  <span className="font-bold text-foreground">3. Notificação Imediata</span>
                  <span>O status muda para &quot;Na Recepção&quot; (pulsante em âmbar), avisando o profissional.</span>
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SEÇÃO 3: PAGAMENTOS & REPASSES */}
      <section id="pagamentos-repasses" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
            3
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Registro de Pagamentos e Divisão Automática de Repasse
            </h2>
            <p className="text-xs text-muted-foreground">
              O paciente paga diretamente no consultório ou na recepção — a plataforma calcula as divisões
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="size-4 text-emerald-600 dark:text-emerald-400" /> Como Funciona o Pagamento?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Sem taxas de intermediação de cartão da plataforma:</strong> O pagamento da consulta <span className="text-foreground font-semibold">não é transacionado pelo Salus</span>. O paciente paga diretamente à clínica ou ao profissional através de PIX na maquininha, dinheiro ou cartão.
              </p>
              <p>
                <strong className="text-foreground">Registro flexível:</strong> Qualquer perfil com permissão (Administrador, Secretária ou o próprio Profissional) pode clicar em <span className="text-foreground font-semibold">&quot;Registrar pagamento&quot;</span> no atendimento e informar o valor recebido e o meio utilizado.
              </p>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                <p className="font-bold text-emerald-700 dark:text-emerald-300">
                  Cálculo Automático de Repasse
                </p>
                <p className="text-muted-foreground">
                  Assim que o pagamento é confirmado, o Salus aplica a regra de repasse cadastrada para o profissional e gera os lançamentos nos extratos financeiros da clínica e do profissional.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Exemplo Numérico */}
          <Card className="border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="size-4 text-primary" /> Exemplo Prático de Divisão
              </CardTitle>
              <CardDescription>
                Consulta de Psicologia no valor de R$ 250,00:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valor total pago pelo paciente:</span>
                  <span className="text-base font-bold text-foreground">R$ 250,00</span>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex justify-between items-center text-primary font-medium">
                  <span>Repasse devido ao Profissional (80%):</span>
                  <span className="font-bold">R$ 200,00</span>
                </div>
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Taxa retida pela Clínica (20%):</span>
                  <span className="font-bold">R$ 50,00</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href="/painel/financeiro"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Ver Financeiro da Clínica <ExternalLink className="size-3" />
                </Link>
                <span className="text-muted-foreground">·</span>
                <Link
                  href="/painel/extrato"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Ver Meu Extrato <ExternalLink className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SEÇÃO 4: LINK PESSOAL DO PROFISSIONAL */}
      <section id="link-profissional" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-violet-600 text-white font-bold text-sm">
            4
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Link Pessoal de Agendamento Online & Perfil
            </h2>
            <p className="text-xs text-muted-foreground">
              Cada profissional possui uma página exclusiva para divulgação no Instagram, WhatsApp e Cartão Digital
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
                <p>
                  No menu <strong className="text-foreground">&quot;Meu perfil&quot;</strong>, todo profissional pode atualizar sua foto, número de registro no conselho (CRM, CRP, CRO, etc.), especialidade, bio e obter seu <strong className="text-foreground">Link de Agendamento Pessoal</strong>.
                </p>
                <p>
                  Ao enviar este link para um paciente ou colocar na bio do Instagram, o paciente escolhe diretamente a data e o horário disponível na sala em que o profissional atua, sem conflitos de agenda!
                </p>
                <div className="pt-2">
                  <Link
                    href="/painel/perfil"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <User className="size-3.5" /> Acessar Meu Perfil Agora
                  </Link>
                </div>
              </div>

              {/* Card Ilustrativo */}
              <div className="w-full md:w-80 rounded-2xl border-2 border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-background p-4 shadow-md space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-violet-600 text-white font-bold text-sm">
                    FP
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-xs">Dr. Felipe Maia</p>
                    <p className="text-[10px] text-muted-foreground">CRP 06/12345 · Psicólogo Clínico</p>
                  </div>
                </div>
                <div className="rounded-xl bg-background/80 p-2.5 border border-border/60 text-[11px] font-mono text-muted-foreground truncate">
                  salus.com.br/agendar/felipe-maia
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="size-3 shrink-0" />
                  Pronto para receber agendamentos de pacientes
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SEÇÃO 5: DÚVIDAS FREQUENTES & SUPORTE */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" /> Dúvidas Frequentes & Boas Práticas
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 text-xs text-muted-foreground">
          <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-1.5">
            <h4 className="font-semibold text-foreground">Como cadastrar novos profissionais pela Recepção?</h4>
            <p>
              A recepção tem permissão para cadastrar e vincular novos profissionais à clínica no menu &quot;Profissionais&quot;. O profissional receberá um convite por e-mail para definir sua senha de acesso.
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-1.5">
            <h4 className="font-semibold text-foreground">Como alternar entre múltiplas clínicas?</h4>
            <p>
              Clique no nome da clínica no topo da página ao lado do logo Salus. O seletor listará todos os consultórios em que você tem cadastro. Caso queira cadastrar mais clínicas, utilize o botão de Upgrade Multi-Clínicas.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
