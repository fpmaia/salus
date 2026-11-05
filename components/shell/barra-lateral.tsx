"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { iconeDaRota, rotaAtiva } from "./icones";

export type ItemMenu = { href: string; rotulo: string };
export type GrupoMenu = { rotulo: string; itens: ItemMenu[] };

/**
 * Menu lateral recolhível (Ctrl+B): só ícones quando recolhido, com dica no hover; no celular
 * vira uma gaveta. O <nav> mantém o nome "Menu principal" (acessibilidade e testes).
 */
export function BarraLateral({
  grupos,
  raiz,
  cabecalho,
  rodape,
}: {
  grupos: GrupoMenu[];
  /** Rota inicial da área ("/painel" ou "/plataforma"). */
  raiz: string;
  cabecalho: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">{cabecalho}</SidebarHeader>
      <SidebarContent>
        <nav aria-label="Menu principal" className="contents">
          {grupos.map((grupo) => (
            <SidebarGroup key={grupo.rotulo}>
              <SidebarGroupLabel>{grupo.rotulo}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {grupo.itens.map((item) => {
                    const Icone = iconeDaRota(item.href);
                    const ativo = rotaAtiva(item.href, pathname, raiz);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={ativo} tooltip={item.rotulo}>
                          <Link
                            href={item.href}
                            aria-current={ativo ? "page" : undefined}
                            onClick={() => isMobile && setOpenMobile(false)}
                          >
                            <Icone />
                            <span>{item.rotulo}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      {rodape && <SidebarFooter className="border-t border-sidebar-border">{rodape}</SidebarFooter>}
      <SidebarRail />
    </Sidebar>
  );
}
