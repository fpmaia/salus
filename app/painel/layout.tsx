import Link from "next/link";
import { cookies } from "next/headers";
import { AlertCircle, Gift } from "lucide-react";
import { obterContextoTenant, situacaoDaAssinaturaAtual } from "@/src/auth/sessao";
import { pode, type Permissao } from "@/src/domain/rbac";
import { formatarDataBr } from "@/src/server/reservas";
import { SalusLogo } from "@/components/brand/salus-logo";
import { RodapeLegal } from "@/components/rodape-legal";
import { BarraLateral, type GrupoMenu } from "@/components/shell/barra-lateral";
import { MenuUsuario } from "@/components/shell/menu-usuario";
import { BotaoBusca, PaletaComandos, type AcaoPaleta } from "@/components/shell/paleta-comandos";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ROTULOS_ROLE } from "@/src/domain/rbac";
import { buscarPacientesAcao } from "./pacientes/actions";
import { modulosDoEspaco, type Modulo } from "@/src/server/modulos";
import { ehSuperadmin } from "@/src/server/plataforma";
import { ProvedorAvisos } from "@/components/avisos";
import { BannerPrimeirosPassos } from "@/components/banner-primeiros-passos";
import { BannerProntuarioProfissional } from "@/components/banner-prontuario-profissional";
import { primeirosPassos } from "@/src/server/primeiros-passos";
import { obterStatusLicencaProntuarioProfissional, periodoDeTesteDoEspaco } from "@/src/server/assinatura";
import { BotaoAjuda } from "@/components/manual/ajuda-contextual";
import { SeletorClinica } from "@/components/seletor-clinica";

type Grupo = "operacao" | "financeiro" | "configuracoes";
const ROTULOS_GRUPO: Record<Grupo, string> = { operacao: "Operação", financeiro: "Financeiro", configuracoes: "Configurações" };

const NAVEGACAO: { href: string; rotulo: string; grupo: Grupo; permissao?: Permissao; modulo?: Modulo }[] = [
  { href: "/painel", rotulo: "Início", grupo: "operacao" },
  { href: "/painel/agenda", rotulo: "Agenda", grupo: "operacao", permissao: "agenda.ver" },
  { href: "/painel/atendimentos", rotulo: "Atendimentos do dia", grupo: "operacao", permissao: "agenda.ver" },
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
  { href: "/painel/documentos", rotulo: "Documentos e timbrado", grupo: "configuracoes", permissao: "documentos.personalizar" },
  { href: "/painel/notificacoes", rotulo: "Notificações", grupo: "configuracoes", permissao: "auditoria.ver" },
  { href: "/painel/assinatura", rotulo: "Assinatura", grupo: "configuracoes", permissao: "assinatura.ver" },
  { href: "/painel/perfil", rotulo: "Meu perfil", grupo: "configuracoes" },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const ctx = await obterContextoTenant();

  const modulos = await modulosDoEspaco(ctx);
  const itens = NAVEGACAO.filter(
    (item) => (!item.permissao || pode(ctx.role, item.permissao)) && (!item.modulo || modulos[item.modulo])
  ).map(({ href, rotulo, grupo }) => ({
    href,
    grupo,
    // O profissional só vê o próprio contrato.
    rotulo: href === "/painel/contratos" && ctx.role === "profissional" ? "Meu contrato" : rotulo,
  }));


  // Atraso: só quem paga vê o aviso. Suspensão: todos (as ações recusam para todos).
  const situacao = await situacaoDaAssinaturaAtual();
  const pagaAssinatura = pode(ctx.role, "assinatura.ver");
  const superadmin = await ehSuperadmin(ctx.userId);
  // Teste grátis (convite da plataforma): só quem paga vê até quando vai e quando começa a cobrança.
  const teste = pagaAssinatura ? await periodoDeTesteDoEspaco(ctx).catch(() => null) : null;
  const etapas = pode(ctx.role, "tenant.configurar") ? await primeirosPassos(ctx).catch(() => []) : [];
  const statusProntuarioProfissional =
    ctx.role === "profissional" && modulos.prontuario
      ? await obterStatusLicencaProntuarioProfissional(ctx).catch(() => null)
      : null;

  const grupos: GrupoMenu[] = (Object.keys(ROTULOS_GRUPO) as Grupo[])
    .map((g) => ({ rotulo: ROTULOS_GRUPO[g], itens: itens.filter((i) => i.grupo === g).map(({ href, rotulo }) => ({ href, rotulo })) }))
    .filter((g) => g.itens.length > 0);
  const acoesRapidas: AcaoPaleta[] = [
    ...(pode(ctx.role, "agenda.ver") ? [{ href: "/painel/agenda", rotulo: "Novo agendamento", icone: "agendamento" as const }] : []),
    ...(pode(ctx.role, "pacientes.gerenciar") ? [{ href: "/painel/pacientes?novo=1", rotulo: "Novo paciente", icone: "paciente" as const }] : []),
  ];
  // Menu lateral aberto ou recolhido: lembrado no cookie do próprio componente.
  const menuAberto = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <ProvedorAvisos>
      <SidebarProvider defaultOpen={menuAberto}>
        <BarraLateral
          raiz="/painel"
          grupos={grupos}
          cabecalho={
            <span className="flex items-center gap-2 overflow-hidden">
              <span className="group-data-[collapsible=icon]:hidden">
                <SalusLogo href="/painel" size="sm" priority />
              </span>
              <span className="hidden group-data-[collapsible=icon]:block">
                <SalusLogo href="/painel" variant="symbol" size="sm" />
              </span>
            </span>
          }
          rodape={
            <BotaoAjuda className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center [&>span]:group-data-[collapsible=icon]:hidden" />
          }
        />
        <SidebarInset className="min-w-0 selection:bg-primary/20 selection:text-primary">
          {/* Barra superior: menu, clínica, busca e conta */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur-md sm:px-4 print:hidden">
            <SidebarTrigger aria-label="Abrir ou recolher o menu" />
            <Separator orientation="vertical" className="mx-1 h-5" />
            <SeletorClinica
              clinicaAtualId={ctx.tenantId}
              clinicaAtualNome={ctx.tenantNome}
              roleAtual={ctx.role}
              todasClinicas={ctx.todasClinicas}
            />
            <div className="ml-auto flex flex-1 items-center justify-end gap-2">
              <div className="hidden flex-1 justify-end md:flex">
                <BotaoBusca />
              </div>
              <span className="md:hidden">
                <BotaoBusca compacto />
              </span>
              <MenuUsuario
                nome={ctx.usuario.nome}
                email={ctx.usuario.email}
                subtitulo={ROTULOS_ROLE[ctx.role]}
                perfilHref="/painel/perfil"
                links={superadmin ? [{ href: "/plataforma", rotulo: "Plataforma Salus", icone: "plataforma" }] : []}
              />
            </div>
          </header>

      {/* Banner de Primeiros Passos Contextual */}
      {etapas.length > 0 && <BannerPrimeirosPassos etapas={etapas} />}

      {/* Banner de Prontuário para Profissional Convidado */}
      {statusProntuarioProfissional?.possuiPerfilProfissional && (
        <BannerProntuarioProfissional status={statusProntuarioProfissional} />
      )}

      {/* Fatura do Salus em atraso (carência) ou espaço suspenso (só consulta) */}
      {situacao.estado !== "em_dia" && (situacao.estado === "suspensa" || pagaAssinatura) && (
        <div
          role="alert"
          className={`border-b px-4 py-2.5 text-center text-xs sm:text-sm font-medium flex flex-wrap items-center justify-center gap-x-2 gap-y-1 print:hidden ${
            situacao.estado === "suspensa"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-warning/10 border-warning/20 text-warning"
          }`}
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>
            {situacao.estado === "suspensa"
              ? `Espaço só para consulta: a fatura do Salus venceu em ${formatarDataBr(situacao.vencimento)} e não foi paga. Ninguém consegue marcar nem alterar nada até o pagamento.`
              : `A fatura do Salus venceu em ${formatarDataBr(situacao.vencimento)}. Se não for paga até ${formatarDataBr(situacao.suspensaoEm)}, o espaço fica só para consulta.`}
            {!pagaAssinatura && " Fale com o administrador do espaço."}
          </span>
          {pagaAssinatura && (
            <Link href="/painel/assinatura" className="font-semibold underline underline-offset-4 hover:opacity-80">
              Pagar a fatura
            </Link>
          )}
        </div>
      )}

      {teste?.ativo && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-primary/20 bg-primary/5 px-4 py-2 text-center text-xs font-medium text-foreground print:hidden">
          <Gift className="size-4 shrink-0 text-primary" />
          <span>
            Teste grátis até {formatarDataBr(teste.ate)}. A primeira fatura do Salus é a de{" "}
            {new Date(`${teste.primeiraCompetencia}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}.
          </span>
          <Link href="/painel/assinatura" className="font-semibold text-primary underline underline-offset-4 hover:opacity-80">
            Ver plano
          </Link>
        </div>
      )}

      {/* Conteúdo da Página */}
          <div className="flex-1">{children}</div>

      {/* Rodapé: marca do Salus e documentos legais (a LS Code só aparece nas páginas públicas). */}
      <footer className="border-t border-border/40 bg-muted/10 py-6 px-4 sm:px-6 print:hidden">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <SalusLogo variant="symbol" size="xs" />
            <span>Salus • Gestão de Saúde</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link
              href="/manual"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline font-medium"
            >
              Manual do Usuário
            </Link>
            <RodapeLegal className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" />
          </div>
        </div>
      </footer>
        </SidebarInset>
        <PaletaComandos
          itens={itens.map(({ href, rotulo, grupo }) => ({ href, rotulo, grupo: ROTULOS_GRUPO[grupo] }))}
          acoes={acoesRapidas}
          buscarPacientes={pode(ctx.role, "pacientes.ver") ? buscarPacientesAcao : undefined}
        />
      </SidebarProvider>
    </ProvedorAvisos>
  );
}
