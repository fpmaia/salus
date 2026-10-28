import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircle, Sparkles, ChevronRight } from "lucide-react";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { SalusLogo } from "@/components/brand/salus-logo";
import { RodapeLegal } from "@/components/rodape-legal";
import { HeroShowcase } from "@/components/landing/hero-showcase";
import { BentoFeatures } from "@/components/landing/bento-features";
import { PricingCalculator } from "@/components/landing/pricing-calculator";
import { SocialProof } from "@/components/landing/social-proof";
import { SecurityCompliance } from "@/components/landing/security-compliance";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaFinal } from "@/components/landing/cta-final";

export const metadata = {
  title: "Salus — Software de Gestão para Clínicas, Consultórios e Coworkings de Saúde",
  description:
    "Gestão inteligente de salas, ocupação em tempo real, prontuário eletrônico cifrado (EHR), lembretes de WhatsApp e cobrança automática via PIX.",
  keywords: [
    "gestão de clínicas",
    "coworking de saúde",
    "sublocação de consultórios",
    "prontuário eletrônico CFM",
    "agenda médica inteligente",
    "cobrança pix clínicas",
  ],
};

function linkWhatsapp(): string {
  const numero = (process.env.SALUS_WHATSAPP_COMERCIAL ?? "").replace(/\D/g, "");
  if (!numero) return "/cadastro";
  const texto = "Olá! Gostaria de agendar uma demonstração do Salus para o meu espaço.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export default function Home() {
  const linkDemo = linkWhatsapp();
  const ehWhatsapp = linkDemo.startsWith("https://wa.me");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary scroll-smooth">
      {/* Header Fixo com Efeito Glassmorphism */}
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <SalusLogo href="/" size="md" priority />

          <nav aria-label="Navegação Principal" className="hidden items-center gap-7 text-xs font-semibold text-muted-foreground md:flex">
            <a href="#recursos" className="hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#planos" className="hover:text-foreground transition-colors">
              Planos & Preços
            </a>
            <a href="#seguranca" className="hover:text-foreground transition-colors">
              Segurança & CFM
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              Dúvidas
            </a>
            <Link href="/manual" className="hover:text-primary transition-colors font-bold text-foreground flex items-center gap-1">
              Manual
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/entrar"
              className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Entrar
            </Link>

            <Link
              href="/cadastro"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:scale-102"
            >
              Criar Espaço <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative px-4 pt-12 pb-20 sm:px-6 sm:pt-20 lg:pt-24 overflow-hidden">
          {/* Luzes de fundo atmosféricas */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px] opacity-70" />

          <div className="mx-auto max-w-6xl space-y-12">
            {/* Bloco de Texto Central */}
            <div className="text-center space-y-6 max-w-3xl mx-auto">
              {/* Badge de Destaque */}
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary animate-in fade-in slide-in-from-bottom-2 shadow-xs">
                <Sparkles className="size-3.5" />
                <span>Novo: Módulo Prontuário Eletrônico (EHR) com 15 dias grátis</span>
                <ChevronRight className="size-3 text-primary/70" />
              </div>

              {/* Título Principal */}
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl sm:leading-[1.1] text-foreground">
                O ecossistema definitivo para{" "}
                <span className="bg-gradient-to-r from-primary via-teal-600 to-emerald-600 bg-clip-text text-transparent">
                  clínicas inteligentes
                </span>{" "}
                e coworkings de saúde.
              </h1>

              {/* Subtítulo */}
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Salas ocupadas, recepção sem planilhas e faturamento automático no PIX. Da sublocação avulsa ao prontuário médico criptografado, tudo em um só lugar.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/cadastro"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
                >
                  Começar Gratuitamente <ArrowRight className="size-4" />
                </Link>

                <a
                  href={linkDemo}
                  target={ehWhatsapp ? "_blank" : undefined}
                  rel={ehWhatsapp ? "noreferrer" : undefined}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/80 backdrop-blur-md px-6 py-3.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
                >
                  <MessageCircle className="size-4 text-emerald-500" /> Agendar Demonstração
                </a>
              </div>

              {/* Selos de Confiança */}
              <div className="pt-4 flex flex-wrap items-center justify-center gap-5 text-xs text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> Prontuário cifrado e com guarda de 20 anos
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> Cobrança PIX automática
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-600" /> Sem fidelidade contratual
                </span>
              </div>
            </div>

            {/* Showcase Interativo do Sistema */}
            <div className="pt-4">
              <HeroShowcase />
            </div>
          </div>
        </section>

        {/* BENTO GRID DE RECURSOS */}
        <BentoFeatures />

        {/* TABELA DE PLANOS & SIMULADOR INTERATIVO */}
        <PricingCalculator linkContato={linkDemo} />

        {/* PROVA SOCIAL & DEPOIMENTOS */}
        <SocialProof />

        {/* SEGURANÇA & COMPLIANCE CFM */}
        <SecurityCompliance />

        {/* PERGUNTAS FREQUENTES */}
        <FaqSection />

        {/* CTA FINAL IMERSIVO */}
        <CtaFinal />
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border/80 px-4 py-12 sm:px-6 bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <SalusLogo size="sm" />
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Salus · Sistema de Gestão para Clínicas e Coworkings de Saúde.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/manual" className="font-semibold text-foreground hover:text-primary transition-colors">
              Manual do Usuário
            </Link>
            <span className="text-border">•</span>
            <RodapeLegal />
          </div>
          <LSCodeBadge variant="footer" />
        </div>
      </footer>
    </div>
  );
}
