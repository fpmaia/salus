import Link from "next/link";
import { ArrowRight, MessageCircle, Sparkles, ShieldCheck } from "lucide-react";

export function CtaFinal() {
  const numeroWhatsapp = (process.env.SALUS_WHATSAPP_COMERCIAL ?? "").replace(/\D/g, "");
  const linkWhatsapp = numeroWhatsapp
    ? `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent("Olá! Gostaria de agendar uma demonstração do Salus para o meu espaço de saúde.")}`
    : "/cadastro";

  return (
    <section className="relative px-4 py-20 sm:px-6 overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/15 via-primary/5 to-background p-8 sm:p-16 shadow-2xl text-center space-y-8">
          {/* Glows decorativos */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-primary/25 blur-3xl opacity-70" />
          <div className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl opacity-60" />

          <div className="max-w-2xl mx-auto space-y-4 relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-3 py-1 text-xs font-bold text-primary uppercase tracking-wide">
              <Sparkles className="size-3.5" /> Comece em Menos de 5 Minutos
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Pronto para colocar sua clínica no piloto automático?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Junte-se a consultórios e coworkings de saúde que eliminaram a ociosidade de salas, automatizaram o financeiro e ganharam a confiança de seus profissionais.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 relative z-10">
            <Link
              href="/cadastro"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
            >
              Criar Espaço Agora <ArrowRight className="size-4" />
            </Link>

            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/80 backdrop-blur-md px-6 py-4 text-sm font-bold text-foreground hover:bg-muted transition-all"
            >
              <MessageCircle className="size-4 text-emerald-500" /> Agendar Demonstração
            </a>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground relative z-10">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" /> Sem taxa de adesão ou instalação
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" /> 15 dias de teste grátis no Prontuário
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" /> Cancele quando quiser
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
