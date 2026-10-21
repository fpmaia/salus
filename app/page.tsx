import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileCheck2,
  Lock,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Background Decorativo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[650px] rounded-full bg-primary/10 blur-[130px]" />
        <div className="absolute top-[600px] -left-20 size-[450px] rounded-full bg-emerald-500/8 blur-[120px]" />
        <div className="absolute top-[800px] -right-20 size-[500px] rounded-full bg-teal-500/8 blur-[120px]" />
      </div>

      {/* Header de Navegação */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <SalusLogo href="/" size="md" priority />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Como Funciona
            </a>
            <a href="#seguranca" className="transition-colors hover:text-foreground">
              Segurança & LGPD
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs">
              <Link href="/cadastro">Cadastrar Espaço</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="mx-auto max-w-4xl text-center">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-medium text-primary mb-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <Sparkles className="size-3.5" />
              <span>Plataforma Inteligente para Coworkings de Saúde</span>
            </div>

            {/* Headline */}
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-[1.15]">
              A gestão moderna e sem conflitos para o seu{" "}
              <span className="bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent dark:from-teal-400 dark:to-emerald-300">
                espaço de saúde
              </span>
            </h1>

            {/* Subtítulo */}
            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              Reserve salas em tempo real sem risco de sobreposição, organize a recepção de pacientes, emita prontuários seguros e automatize repasses financeiros em minutos.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md gap-2">
                <Link href="/cadastro">
                  Começar Gratuitamente
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-6 border-border/80 hover:bg-muted">
                <Link href="/entrar">Acessar Demonstração</Link>
              </Button>
            </div>

            {/* Mini Trust Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Zero conflitos de agenda</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Conformidade total com a LGPD</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Fechamento financeiro automatizado</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Showcase / Mockup */}
          <div className="mx-auto mt-14 max-w-5xl">
            <div className="relative rounded-2xl border border-border/60 bg-card/70 p-3 sm:p-5 shadow-2xl backdrop-blur-xl">
              {/* Top Window Bar */}
              <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full bg-rose-500/80" />
                  <div className="size-3 rounded-full bg-amber-500/80" />
                  <div className="size-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs font-mono text-muted-foreground hidden sm:inline">
                    salus.app/painel
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Ambiente Seguro • Row Level Security Ativo</span>
                </div>
              </div>

              {/* Mockup Dashboard Grid */}
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Card 1: Reserva Ativa */}
                <div className="rounded-xl border border-border/50 bg-background/60 p-4 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sala 01 • Maca & Pia</span>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Ocupada
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Dra. Profissional Alfa
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    10:00 – 12:00 • Consulta de Psicologia
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="text-muted-foreground">Paciente:</span>
                    <span className="font-medium">Ana Paciente</span>
                  </div>
                </div>

                {/* Card 2: Extrato Financeiro */}
                <div className="rounded-xl border border-border/50 bg-background/60 p-4 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Fechamento do Mês</span>
                    <TrendingUp className="size-4 text-emerald-500" />
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                    R$ 4.250,00
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    94 horas de salas faturadas com precisão
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="text-muted-foreground">Repasses calculados:</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">100% Conciliado</span>
                  </div>
                </div>

                {/* Card 3: Unidades & Salas */}
                <div className="rounded-xl border border-border/50 bg-background/60 p-4 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Unidade Centro</span>
                    <Building2 className="size-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    3 Salas Disponíveis
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Funcionamento: Seg–Sex, 07h às 21h
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="text-muted-foreground">Bloqueio de sobreposição:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Ativo (GIST)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recursos Bento Grid */}
        <section id="recursos" className="border-t border-border/40 bg-muted/20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
                Tudo o que seu coworking precisa em um só lugar
              </h2>
              <p className="mt-3 text-muted-foreground text-sm sm:text-base">
                Desenvolvido especificamente para as complexidades operacionais, fiscais e sanitárias dos espaços médicos compartilhados.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Item 1 */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs hover:border-primary/40 transition-all glow-card">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <DoorOpen className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  Reserva de Salas
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Profissionais reservam por período avulso ou recorrente. Bloqueio automático de sobreposições em nível de banco de dados.
                </p>
              </div>

              {/* Item 2 */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs hover:border-primary/40 transition-all glow-card">
                <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                  <CalendarCheck className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  Agenda da Recepção
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Pacientes são agendados dentro das reservas do profissional. Check-in rápido e confirmações de presença com poucos cliques.
                </p>
              </div>

              {/* Item 3 */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs hover:border-primary/40 transition-all glow-card">
                <div className="flex size-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mb-4">
                  <FileCheck2 className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  Prontuário & LGPD
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Histórico clínico imutável, suporte a anexos de exames criptografados e controle rígido de consentimento para mensagens.
                </p>
              </div>

              {/* Item 4 */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs hover:border-primary/40 transition-all glow-card">
                <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
                  <Receipt className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  Fechamento & Repasses
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Modelos de locação por hora, consulta ou percentual. Fechamento mensal automatizado com extrato transparente por profissional.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Seção Como Funciona */}
        <section id="como-funciona" className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="text-center max-w-xl mx-auto mb-12">
              <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground">
                Fluxo simples para você e seus locatários
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Três etapas práticas para operar com eficiência profissional.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="relative flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/40">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4 shadow-sm">
                  1
                </div>
                <h3 className="font-heading font-semibold text-base">Cadastre seu Espaço</h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Defina unidades, horários de funcionamento e cadastre as salas com seus equipamentos (maca, pia, divã).
                </p>
              </div>

              <div className="relative flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/40">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4 shadow-sm">
                  2
                </div>
                <h3 className="font-heading font-semibold text-base">Convide os Profissionais</h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Envie links de convite. Cada profissional ganha acesso ao portal para reservar salas e consultar extratos.
                </p>
              </div>

              <div className="relative flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/40">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4 shadow-sm">
                  3
                </div>
                <h3 className="font-heading font-semibold text-base">Opere e Fature no Piloto Automático</h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  O sistema audita os atendimentos, impede conflitos e consolida o fechamento financeiro no fim do mês.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Segurança e LGPD */}
        <section id="seguranca" className="border-t border-border/40 bg-muted/30 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-8" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-bold text-foreground">
                  Arquitetura Segura & Conformidade LGPD
                </h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Isolamento rígido com Row Level Security (RLS) no PostgreSQL: cada tenant possui seus dados estritamente segregados. Trilha de auditoria imutável para ações críticas e proteção de dados de saúde.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="px-4 py-20 text-center sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Pronto para elevar o nível da sua clínica?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Crie seu espaço de saúde agora mesmo e experimente uma nova experiência de gestão.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Button asChild size="lg" className="h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                <Link href="/cadastro">Criar Minha Conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer com Selo da LS Code */}
      <footer className="border-t border-border/50 bg-background/80 py-10 px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <SalusLogo size="sm" />
            <span className="hidden sm:inline text-border">|</span>
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              © {new Date().getFullYear()} Salus Gestão em Saúde. Todos os direitos reservados.
            </p>
          </div>

          {/* Destaque LS Code */}
          <LSCodeBadge variant="footer" />
        </div>
      </footer>
    </div>
  );
}
