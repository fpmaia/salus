import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { precisaConfigurar2FA, ROTA_CONFIGURAR_2FA } from "@/src/auth/dois-fatores";
import { ROTULOS_PAPEL_PLATAFORMA, type PermissaoPlataforma } from "@/src/domain/permissoes-plataforma";
import { conviteEquipePendenteDoUsuario } from "@/src/server/equipe-plataforma";
import { acessoPlataforma } from "./acesso";
import { AceitarConviteEquipe } from "./aceitar-convite-equipe";
import { AcessoNegado } from "@/components/acesso-negado";
import { SalusLogo } from "@/components/brand/salus-logo";
import { ProvedorAvisos } from "@/components/avisos";
import { BarraLateral } from "@/components/shell/barra-lateral";
import { MenuUsuario } from "@/components/shell/menu-usuario";
import { BotaoBusca, PaletaComandos } from "@/components/shell/paleta-comandos";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const LINKS: { href: string; rotulo: string; grupo: "Gestão" | "Comercial" | "Acesso"; permissao: PermissaoPlataforma }[] = [
  { href: "/plataforma", rotulo: "Visão geral", grupo: "Gestão", permissao: "ver" },
  { href: "/plataforma/clinicas", rotulo: "Clínicas", grupo: "Gestão", permissao: "ver" },
  { href: "/plataforma/financeiro", rotulo: "Financeiro", grupo: "Gestão", permissao: "ver" },
  { href: "/plataforma/planos", rotulo: "Planos", grupo: "Comercial", permissao: "ver" },
  { href: "/plataforma/cupons", rotulo: "Cupons", grupo: "Comercial", permissao: "ver" },
  { href: "/plataforma/convites", rotulo: "Convites", grupo: "Comercial", permissao: "ver" },
  { href: "/plataforma/usuarios", rotulo: "Usuários", grupo: "Acesso", permissao: "ver" },
  { href: "/plataforma/equipe", rotulo: "Equipe", grupo: "Acesso", permissao: "ver" },
  { href: "/plataforma/auditoria", rotulo: "Auditoria", grupo: "Acesso", permissao: "ver" },
];

export default async function PlataformaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { usuario, papel, pode } = await acessoPlataforma();

  // Equipe da plataforma: 2FA obrigatório (src/auth/dois-fatores.ts).
  if (papel && precisaConfigurar2FA(usuario, true)) redirect(`${ROTA_CONFIGURAR_2FA}?obrigatorio=1`);

  if (!papel) {
    // Convidado para a equipe: aceita aqui, entrando com o e-mail do convite.
    const convite = await conviteEquipePendenteDoUsuario(usuario.id);
    if (convite) return <AceitarConviteEquipe convite={convite} />;
    return (
      <AcessoNegado
        titulo="Área Restrita à Equipe da Plataforma"
        mensagem="Esta área é de acesso exclusivo da administração central e mantenedores do Salus (LS Code)."
      />
    );
  }

  const visiveis = LINKS.filter((l) => pode(l.permissao));
  const grupos = (["Gestão", "Comercial", "Acesso"] as const)
    .map((g) => ({ rotulo: g, itens: visiveis.filter((l) => l.grupo === g).map(({ href, rotulo }) => ({ href, rotulo })) }))
    .filter((g) => g.itens.length > 0);
  const menuAberto = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <ProvedorAvisos>
      <SidebarProvider defaultOpen={menuAberto}>
        <BarraLateral
          raiz="/plataforma"
          grupos={grupos}
          cabecalho={
            <span className="flex items-center gap-2 overflow-hidden">
              <span className="group-data-[collapsible=icon]:hidden">
                <SalusLogo href="/plataforma" size="sm" priority />
              </span>
              <span className="hidden group-data-[collapsible=icon]:block">
                <SalusLogo href="/plataforma" variant="symbol" size="sm" />
              </span>
            </span>
          }
          rodape={
            <span className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary group-data-[collapsible=icon]:justify-center">
              <Shield className="size-3.5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Plataforma Salus</span>
            </span>
          }
        />
        <SidebarInset className="min-w-0 selection:bg-primary/20 selection:text-primary">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur-md sm:px-4">
            <SidebarTrigger aria-label="Abrir ou recolher o menu" />
            <Separator orientation="vertical" className="mx-1 h-5" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
              <Shield className="size-3" /> Plataforma
            </span>
            <div className="ml-auto flex flex-1 items-center justify-end gap-2">
              <div className="hidden flex-1 justify-end md:flex">
                <BotaoBusca />
              </div>
              <span className="md:hidden">
                <BotaoBusca compacto />
              </span>
              <MenuUsuario
                nome={usuario.name}
                email={usuario.email}
                subtitulo={ROTULOS_PAPEL_PLATAFORMA[papel]}
                links={[{ href: "/painel", rotulo: "Painel da clínica", icone: "painel" }]}
              />
            </div>
          </header>

          <div className="flex-1">{children}</div>

          <footer className="border-t border-border/40 bg-muted/10 px-4 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
              <span>Salus Plataforma · Sistema Central de Controle Multitenant</span>
              <span>
                Desenvolvido pela <strong>LS Code</strong>
              </span>
            </div>
          </footer>
        </SidebarInset>
        <PaletaComandos itens={visiveis.map(({ href, rotulo, grupo }) => ({ href, rotulo, grupo }))} />
      </SidebarProvider>
    </ProvedorAvisos>
  );
}
