import Link from "next/link";
import { ShieldCheck, Lock, FileKey, Database, CheckCircle, ArrowRight } from "lucide-react";

export function SecurityCompliance() {
  return (
    <section id="seguranca" className="relative px-4 py-24 sm:px-6 bg-muted/20 border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              <ShieldCheck className="size-3.5" /> Segurança Médica e Jurídica
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Blindagem de dados em total conformidade com o CFM e a LGPD.
            </h2>
            <p className="text-sm text-muted-foreground">
              Na área da saúde, segurança não é um detalhe — é requisito ético e legal. O Salus foi desenhado do zero com arquitetura Zero-Trust.
            </p>
          </div>

          <Link
            href="/privacidade"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline self-start md:self-auto"
          >
            Ler Política de Privacidade e Termos de Uso <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-3 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="size-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">Criptografia de Envelope</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Registros clínicos cifrados com chave AES-256 única por espaço. Administradores e recepção não têm chave de leitura.
            </p>
          </div>

          <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-3 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileKey className="size-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">Conformidade CFM</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Atende à Resolução CFM 1.821/07. Registros imutáveis com adendos auditados e rastreamento de acessos.
            </p>
          </div>

          <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-3 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">Isolamento RLS</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Row Level Security direto no banco de dados Postgres: nenhuma clínica consegue acessar dados de outra, mesmo em falhas de aplicação.
            </p>
          </div>

          <div className="rounded-3xl border border-border/80 bg-card p-6 space-y-3 shadow-xs">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle className="size-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">2FA e Autenticação Forte</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verificação em duas etapas obrigatória para administradores da plataforma e membros clínicos sensíveis.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
