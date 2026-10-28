import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, MessageCircle, Sparkles } from "lucide-react";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { RodapeLegal } from "@/components/rodape-legal";
import { ManualConteudo } from "@/components/manual/manual-conteudo";

export const metadata: Metadata = {
  title: "Manual de Utilização Oficial — Salus Gestão de Saúde",
  description:
    "Guia passo a passo completo da plataforma Salus. Aprenda a configurar unidades e salas, gerenciar equipe com RBAC, operar a agenda e lista de espera, emitir contratos, prontuário CFM e faturas PIX.",
  keywords: [
    "manual salus",
    "guia de uso salus",
    "como usar salus",
    "tutorial clínica salus",
    "prontuario eletronico guia",
    "configuração de salas salus",
  ],
};

function linkWhatsapp(): string {
  const numero = (process.env.SALUS_WHATSAPP_COMERCIAL ?? "").replace(/\D/g, "");
  if (!numero) return "/contato";
  const texto = "Olá! Estou consultando o Manual do Salus e gostaria de tirar uma dúvida operacional.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export default function ManualPage() {
  const linkSuporte = linkWhatsapp();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Header Fixo */}
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <SalusLogo href="/" size="md" priority />
            <div className="hidden h-5 w-px bg-border/60 sm:block" />
            <div className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
              <BookOpen className="size-3.5 text-primary" />
              <span>Manual do Usuário</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Voltar ao</span> Início
            </Link>

            <Link
              href="/painel"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all hover:scale-102"
            >
              Ir para o Painel
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION DO MANUAL */}
        <section className="relative px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:pt-20 overflow-hidden border-b border-border/40">
          {/* Luzes de fundo atmosféricas */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/10 blur-[130px] opacity-70" />

          <div className="mx-auto max-w-4xl text-center space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary shadow-xs">
              <Sparkles className="size-3.5" />
              <span>Central de Conhecimento Oficial & Documentação</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              Manual Completo de Utilização
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Tudo o que você e sua equipe precisam para dominar a gestão de espaços clínicos, agendamento de salas,
              prontuário eletrônico CFM, cobranças automáticas e conformidade com a LGPD.
            </p>
          </div>
        </section>

        {/* CONTEÚDO PRINCIPAL INTERATIVO COM FILTRO E BUSCA */}
        <section className="px-4 py-12 sm:px-6">
          <ManualConteudo />
        </section>

        {/* SEÇÃO DE SUPORTE HUMANIZADO */}
        <section className="border-t border-border/60 bg-muted/20 px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl border border-border/70 bg-card/80 p-8 sm:p-10 backdrop-blur-xs shadow-xs text-center space-y-5">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <MessageCircle className="size-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                Ficou com alguma dúvida ou precisa de apoio na migração?
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Nosso time de implantação ajuda você a configurar unidades, importar cadastros de pacientes e capacitar
                toda a sua recepção e corpo clínico.
              </p>
            </div>

            <div className="pt-2">
              <a
                href={linkSuporte}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:scale-102"
              >
                <MessageCircle className="size-4" />
                Falar com Especialista no WhatsApp
              </a>
            </div>
          </div>
        </section>
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
          <RodapeLegal />
          <LSCodeBadge variant="footer" />
        </div>
      </footer>
    </div>
  );
}
