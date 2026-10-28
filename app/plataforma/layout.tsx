import Link from "next/link";
import { ArrowLeft, Building2, LayoutDashboard, Shield, Users, Activity, Layers, DollarSign, Gift } from "lucide-react";
import { redirect } from "next/navigation";
import { precisaConfigurar2FA, ROTA_CONFIGURAR_2FA } from "@/src/auth/dois-fatores";
import { exigirUsuario } from "@/src/auth/sessao";
import { ehSuperadmin } from "@/src/server/plataforma";
import { AcessoNegado } from "@/components/acesso-negado";
import { SalusLogo } from "@/components/brand/salus-logo";
import { BotaoSair } from "@/app/painel/botao-sair";

export default async function PlataformaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await exigirUsuario();
  const superadmin = await ehSuperadmin(usuario.id);

  // Dono da plataforma: 2FA obrigatório (src/auth/dois-fatores.ts).
  if (superadmin && precisaConfigurar2FA(usuario, true)) redirect(`${ROTA_CONFIGURAR_2FA}?obrigatorio=1`);

  if (!superadmin) {
    return (
      <AcessoNegado
        titulo="Área Restrita ao Dono da Plataforma"
        mensagem="Esta área é de acesso exclusivo da administração central e mantenedores do Salus (LS Code)."
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background selection:bg-primary/20 selection:text-primary">
      {/* Header Central da Plataforma */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <SalusLogo href="/plataforma" size="sm" priority />
            <div className="hidden h-5 w-px bg-border/60 sm:block" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-0.5 text-xs font-bold text-primary tracking-wide uppercase">
              <Shield className="size-3" /> Plataforma Salus
            </span>
          </div>

          {/* Links Centrais da Plataforma */}
          <nav className="flex items-center gap-1">
            <Link
              href="/plataforma"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <LayoutDashboard className="size-3.5 text-muted-foreground" /> Visão Geral
            </Link>
            <Link
              href="/plataforma/clinicas"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Building2 className="size-3.5 text-muted-foreground" /> Clínicas
            </Link>
            <Link
              href="/plataforma/convites"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Gift className="size-3.5 text-muted-foreground" /> Convites
            </Link>
            <Link
              href="/plataforma/planos"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Layers className="size-3.5 text-muted-foreground" /> Planos
            </Link>
            <Link
              href="/plataforma/financeiro"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <DollarSign className="size-3.5 text-muted-foreground" /> Financeiro
            </Link>
            <Link
              href="/plataforma/usuarios"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Users className="size-3.5 text-muted-foreground" /> Usuários
            </Link>
            <Link
              href="/plataforma/auditoria"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Activity className="size-3.5 text-muted-foreground" /> Auditoria
            </Link>
          </nav>

          {/* Usuário e Saída */}
          <div className="flex items-center gap-3">
            <Link
              href="/painel"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowLeft className="size-3" /> Painel da Clínica
            </Link>
            <div className="hidden h-4 w-px bg-border/60 sm:block" />
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-bold text-foreground">{usuario.name}</span>
              <span className="text-[10px] text-primary font-semibold">Superadmin</span>
            </div>
            <BotaoSair />
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <div className="flex-1">
        {children}
      </div>

      {/* Footer da Plataforma */}
      <footer className="border-t border-border/40 bg-muted/10 py-6 px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Salus Plataforma · Sistema Central de Controle Multitenant</span>
          <span>Desenvolvido pela <strong>LS Code</strong></span>
        </div>
      </footer>
    </div>
  );
}
