"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  FileText,
  FileSignature,
  Globe,
  Hourglass,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  Shield,
  User,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "cn";

export type GrupoNavegacao = "operacao" | "financeiro" | "configuracoes";

export interface ItemNavegacao {
  href: string;
  rotulo: string;
  grupo: GrupoNavegacao;
}

const ROTULOS_GRUPO: Record<GrupoNavegacao, string> = {
  operacao: "Operação",
  financeiro: "Financeiro",
  configuracoes: "Configurações",
};

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  "/painel": LayoutDashboard,
  "/painel/atendimentos": CalendarCheck,
  "/painel/agenda": CalendarDays,
  "/painel/pacientes": Users,
  "/painel/espera": Hourglass,
  "/painel/prontuario": FileText,
  "/painel/agendamento-online": Globe,
  "/painel/contratos": FileSignature,
  "/painel/financeiro": CircleDollarSign,
  "/painel/fiscal": Receipt,
  "/painel/extrato": Wallet,
  "/painel/unidades": Building2,
  "/painel/profissionais": UserCheck,
  "/painel/equipe": Users,
  "/painel/notificacoes": Bell,
  "/painel/assinatura": CreditCard,
  "/painel/perfil": User,
  "/plataforma": Shield,
};

const ativo = (href: string, pathname: string) => (href === "/painel" ? pathname === "/painel" : pathname.startsWith(href));

function LinkNav({ item, pathname, compacto = true }: { item: ItemNavegacao; pathname: string; compacto?: boolean }) {
  const Icone = ICONES[item.href] ?? LayoutDashboard;
  const atual = ativo(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-current={atual ? "page" : undefined}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors",
        compacto ? "px-3 py-1.5 text-xs" : "w-full px-3 py-2.5 text-sm",
        atual ? "bg-primary text-primary-foreground shadow-xs font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icone className={cn(compacto ? "size-3.5" : "size-4", atual ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
      <span>{item.rotulo}</span>
    </Link>
  );
}

/** Desktop: operação e financeiro na barra; configurações num menu. */
export function PainelNav({ itens }: { itens: ItemNavegacao[] }) {
  const pathname = usePathname();
  const configuracoes = itens.filter((i) => i.grupo === "configuracoes");
  const naBarra = itens.filter((i) => i.grupo !== "configuracoes");
  const menu = useRef<HTMLDetailsElement>(null);

  // Fecha o menu ao navegar e ao clicar fora.
  useEffect(() => {
    menu.current?.removeAttribute("open");
  }, [pathname]);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) menu.current.removeAttribute("open");
    };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);

  return (
    <nav aria-label="Menu principal" className="mx-auto hidden w-full max-w-6xl items-center gap-1 px-4 py-1 sm:px-6 md:flex">
      {naBarra.map((item, i) => (
        <span key={item.href} className="contents">
          {i > 0 && naBarra[i - 1].grupo !== item.grupo && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
          <LinkNav item={item} pathname={pathname} />
        </span>
      ))}
      {configuracoes.length > 0 && (
        <details ref={menu} className="relative ml-auto">
          <summary
            className={cn(
              "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
              configuracoes.some((i) => ativo(i.href, pathname)) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings className="size-3.5" /> Configurações <ChevronDown className="size-3.5" />
          </summary>
          <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-0.5 rounded-xl border bg-popover p-1.5 shadow-lg">
            {configuracoes.map((item) => (
              <LinkNav key={item.href} item={item} pathname={pathname} compacto={false} />
            ))}
          </div>
        </details>
      )}
    </nav>
  );
}

/** Celular: botão que abre a gaveta com todos os grupos. */
export function PainelNavMobile({ itens, rodape }: { itens: ItemNavegacao[]; rodape?: React.ReactNode }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [rotaAberta, setRotaAberta] = useState(pathname);

  // Navegou: fecha a gaveta (ajuste de estado durante a renderização, sem efeito).
  if (rotaAberta !== pathname) {
    setRotaAberta(pathname);
    setAberto(false);
  }

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [aberto]);

  const grupos = (Object.keys(ROTULOS_GRUPO) as GrupoNavegacao[]).filter((g) => itens.some((i) => i.grupo === g));
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        className="inline-flex size-9 items-center justify-center rounded-lg border text-foreground hover:bg-muted"
      >
        <Menu className="size-5" />
      </button>
      {/* Portal: o header tem backdrop-filter, que prenderia o "fixed" dentro dele. */}
      {aberto &&
        createPortal(
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} />
            <nav aria-label="Menu principal" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Menu</span>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="rounded-md p-1 hover:bg-muted">
                  <X className="size-5" />
                </button>
              </div>
              {grupos.map((g) => (
                <div key={g} className="flex flex-col gap-0.5">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ROTULOS_GRUPO[g]}</p>
                  {itens
                    .filter((i) => i.grupo === g)
                    .map((item) => (
                      <LinkNav key={item.href} item={item} pathname={pathname} compacto={false} />
                    ))}
                </div>
              ))}
              {rodape && <div className="mt-auto border-t pt-3">{rodape}</div>}
            </nav>
          </div>,
          document.body,
        )}
    </div>
  );
}
