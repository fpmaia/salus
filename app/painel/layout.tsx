import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode, ROTULOS_ROLE, type Permissao, type Role } from "@/src/domain/rbac";
import { assinaturaEmAtraso } from "@/src/server/assinatura";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { PainelNav, type ItemNavegacao } from "@/components/painel-nav";
import { BotaoAjudaTutorial, TutorialPrimeiroAcesso } from "@/components/tutorial-primeiro-acesso";
import { BotaoSair } from "./botao-sair";
import { SeletorClinica } from "@/components/seletor-clinica";

const NAVEGACAO: { href: string; rotulo: string; permissao?: Permissao }[] = [
  { href: "/painel", rotulo: "Início" },
  { href: "/painel/atendimentos", rotulo: "Atendimentos", permissao: "agenda.propria" },
  { href: "/painel/agenda", rotulo: "Agenda de salas", permissao: "agenda.ver" },
  { href: "/painel/pacientes", rotulo: "Pacientes", permissao: "pacientes.ver" },
  { href: "/painel/espera", rotulo: "Lista de espera", permissao: "agenda.gerenciar" },
  { href: "/painel/prontuario", rotulo: "Prontuário", permissao: "prontuario.menu" },
  { href: "/painel/agendamento-online", rotulo: "Agenda online", permissao: "agenda_online.configurar" },
  { href: "/painel/financeiro", rotulo: "Financeiro", permissao: "financeiro.ver" },
  { href: "/painel/fiscal", rotulo: "Notas fiscais", permissao: "fiscal.ver" },
  { href: "/painel/extrato", rotulo: "Meu extrato", permissao: "extrato.proprio" },
  { href: "/painel/unidades", rotulo: "Unidades e salas", permissao: "salas.gerenciar" },
  { href: "/painel/contratos", rotulo: "Contratos", permissao: "contratos.ver" },
  { href: "/painel/profissionais", rotulo: "Profissionais", permissao: "profissionais.gerenciar" },
  { href: "/painel/equipe", rotulo: "Equipe", permissao: "membros.gerenciar" },
  { href: "/painel/notificacoes", rotulo: "Notificações", permissao: "auditoria.ver" },
  { href: "/painel/assinatura", rotulo: "Assinatura", permissao: "assinatura.ver" },
  { href: "/painel/perfil", rotulo: "Meu perfil" },
  { href: "/painel/manual", rotulo: "Manual" },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const ctx = await obterContextoTenant();
  const { ehSuperadmin } = await import("@/src/server/plataforma");
  const ehDono = await ehSuperadmin(ctx.userId);

  const itens: ItemNavegacao[] = NAVEGACAO.filter(
    (item) => !item.permissao || pode(ctx.role, item.permissao)
  );

  if (ehDono) {
    itens.push({ href: "/plataforma", rotulo: "Plataforma (LS Code)" });
  }

  const atraso = pode(ctx.role, "assinatura.ver") && (await assinaturaEmAtraso(ctx));

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background selection:bg-primary/20 selection:text-primary">
      {/* Componente do Tour Guiado */}
      <TutorialPrimeiroAcesso />

      {/* Header Principal do Painel */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* Logo e Contexto do Espaço com Seletor Multi-clínicas */}
          <div className="flex items-center gap-3 sm:gap-4">
            <SalusLogo href="/painel" size="sm" priority />

            <div className="hidden h-6 w-px bg-border/60 sm:block" />

            <SeletorClinica
              clinicaAtualId={ctx.tenantId}
              clinicaAtualNome={ctx.tenantNome}
              roleAtual={ctx.role}
              todasClinicas={ctx.todasClinicas}
            />
          </div>

          {/* Ações do Topo */}
          <div className="flex items-center gap-2">
            <div className="hidden flex-col items-end sm:flex mr-1">
              <span className="text-xs font-medium text-foreground">{ctx.usuario.nome}</span>
              <span className="text-[10px] text-muted-foreground">{ctx.usuario.email}</span>
            </div>
            <BotaoAjudaTutorial />
            <BotaoSair />
          </div>
        </div>

        {/* Barra de Navegação Horizontal com Ícones */}
        <div className="border-t border-border/40 bg-muted/20">
          <PainelNav itens={itens} />
        </div>
      </header>

      {/* Alerta de Assinatura Vencida */}
      {atraso && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 text-center text-xs sm:text-sm font-medium text-destructive flex items-center justify-center gap-2 print:hidden animate-in fade-in">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            A fatura do Salus deste espaço está vencida. Regularize para evitar suspensão de recursos.
          </span>
          <Link
            href="/painel/assinatura"
            className="font-semibold underline underline-offset-4 hover:opacity-80"
          >
            Ver assinatura
          </Link>
        </div>
      )}

      {/* Conteúdo da Página */}
      <div className="flex-1">
        {children}
      </div>

      {/* Footer do Painel com Créditos Oficiais */}
      <footer className="border-t border-border/40 bg-muted/10 py-6 px-4 sm:px-6 print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <SalusLogo variant="symbol" size="xs" />
            <span>Salus • Gestão de Saúde</span>
          </div>

          <LSCodeBadge variant="footer" />
        </div>
      </footer>
    </div>
  );
}
