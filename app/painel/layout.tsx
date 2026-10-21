import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode, type Permissao } from "@/src/domain/rbac";
import { assinaturaEmAtraso } from "@/src/server/assinatura";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { PainelNav, PainelNavMobile, type ItemNavegacao } from "@/components/painel-nav";
import { modulosDoEspaco, type Modulo } from "@/src/server/modulos";
import { BotaoSair } from "./botao-sair";
import { SeletorClinica } from "@/components/seletor-clinica";

const NAVEGACAO: (ItemNavegacao & { permissao?: Permissao; modulo?: Modulo })[] = [
  { href: "/painel", rotulo: "Início", grupo: "operacao" },
  { href: "/painel/atendimentos", rotulo: "Atendimentos", grupo: "operacao", permissao: "agenda.propria" },
  { href: "/painel/agenda", rotulo: "Agenda de salas", grupo: "operacao", permissao: "agenda.ver" },
  { href: "/painel/pacientes", rotulo: "Pacientes", grupo: "operacao", permissao: "pacientes.ver" },
  { href: "/painel/espera", rotulo: "Lista de espera", grupo: "operacao", permissao: "agenda.gerenciar" },
  { href: "/painel/prontuario", rotulo: "Prontuário", grupo: "operacao", permissao: "prontuario.menu", modulo: "prontuario" },
  { href: "/painel/agendamento-online", rotulo: "Agenda online", grupo: "operacao", permissao: "agenda_online.configurar", modulo: "agendaOnline" },
  { href: "/painel/financeiro", rotulo: "Financeiro", grupo: "financeiro", permissao: "financeiro.ver" },
  { href: "/painel/extrato", rotulo: "Meu extrato", grupo: "financeiro", permissao: "extrato.proprio" },
  { href: "/painel/contratos", rotulo: "Contratos", grupo: "financeiro", permissao: "contratos.ver" },
  { href: "/painel/fiscal", rotulo: "Notas fiscais", grupo: "financeiro", permissao: "fiscal.ver", modulo: "fiscal" },
  { href: "/painel/unidades", rotulo: "Unidades e salas", grupo: "configuracoes", permissao: "salas.gerenciar" },
  { href: "/painel/profissionais", rotulo: "Profissionais", grupo: "configuracoes", permissao: "profissionais.gerenciar" },
  { href: "/painel/equipe", rotulo: "Equipe", grupo: "configuracoes", permissao: "membros.gerenciar" },
  { href: "/painel/notificacoes", rotulo: "Notificações", grupo: "configuracoes", permissao: "auditoria.ver" },
  { href: "/painel/assinatura", rotulo: "Assinatura", grupo: "configuracoes", permissao: "assinatura.ver" },
  { href: "/painel/perfil", rotulo: "Meu perfil", grupo: "configuracoes" },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const ctx = await obterContextoTenant();

  const modulos = await modulosDoEspaco(ctx);
  const itens: ItemNavegacao[] = NAVEGACAO.filter(
    (item) => (!item.permissao || pode(ctx.role, item.permissao)) && (!item.modulo || modulos[item.modulo])
  ).map(({ href, rotulo, grupo }) => ({
    href,
    grupo,
    // O profissional só vê o próprio contrato.
    rotulo: href === "/painel/contratos" && ctx.role === "profissional" ? "Meu contrato" : rotulo,
  }));


  const atraso = pode(ctx.role, "assinatura.ver") && (await assinaturaEmAtraso(ctx));

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background selection:bg-primary/20 selection:text-primary">

      {/* Header Principal do Painel */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* Logo e Contexto do Espaço com Seletor Multi-clínicas */}
          <div className="flex items-center gap-3 sm:gap-4">
            <PainelNavMobile
              itens={itens}
              rodape={
                <div className="flex items-center justify-between gap-2 px-3">
                  <span className="min-w-0 text-xs">
                    <span className="block truncate font-medium">{ctx.usuario.nome}</span>
                    <span className="block truncate text-muted-foreground">{ctx.usuario.email}</span>
                  </span>
                  <BotaoSair />
                </div>
              }
            />
            {/* No celular, só o símbolo: o seletor de clínica ocupa o resto da linha. */}
            <span className="hidden sm:block">
              <SalusLogo href="/painel" size="sm" priority />
            </span>
            <span className="sm:hidden">
              <SalusLogo href="/painel" variant="symbol" size="sm" priority />
            </span>

            <div className="hidden h-6 w-px bg-border/60 sm:block" />

            <SeletorClinica
              clinicaAtualId={ctx.tenantId}
              clinicaAtualNome={ctx.tenantNome}
              roleAtual={ctx.role}
              todasClinicas={ctx.todasClinicas}
            />
          </div>

          {/* Ações do Topo (no celular, ficam no rodapé do menu) */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="hidden flex-col items-end sm:flex mr-1">
              <span className="text-xs font-medium text-foreground">{ctx.usuario.nome}</span>
              <span className="text-[10px] text-muted-foreground">{ctx.usuario.email}</span>
            </div>
            <BotaoSair />
          </div>
        </div>

        {/* Barra de Navegação Horizontal com Ícones */}
        <div className="hidden border-t border-border/40 bg-muted/20 md:block">
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
