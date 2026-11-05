"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTema } from "@/components/tema";
import type { Tema } from "@/components/tema-script";
import { BookOpen, Building2, Keyboard, KeyRound, LogOut, Monitor, Moon, Shield, Sun, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/src/auth/client";
import { abrirAtalhos } from "./paleta-comandos";

export function iniciais(nome: string): string {
  const partes = nome
    .replace(/^(dra?|sr|sra)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

/** Avatar com menu: perfil, segurança, tema, atalhos, manual, Plataforma e sair. */
export function MenuUsuario({
  nome,
  email,
  subtitulo,
  links = [],
  perfilHref,
}: {
  nome: string;
  email: string;
  /** Papel (ex.: "Admin · Coworking Alfa"). */
  subtitulo?: string;
  /** Links extras (ex.: Plataforma, Painel da clínica). */
  links?: { href: string; rotulo: string; icone: "plataforma" | "painel" }[];
  perfilHref?: string;
}) {
  const router = useRouter();
  const { tema: theme, definirTema } = useTema();

  const sair = async () => {
    await authClient.signOut();
    router.push("/entrar");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta de ${nome}`}
        className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-ring/50 transition hover:bg-muted focus-visible:ring-3 sm:rounded-lg sm:py-1 sm:pl-1 sm:pr-2"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-36 flex-col items-start text-left leading-tight lg:flex">
          <span className="w-full truncate text-xs font-medium">{nome}</span>
          {subtitulo && <span className="w-full truncate text-[10px] text-muted-foreground">{subtitulo}</span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{nome}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {perfilHref && (
            <DropdownMenuItem asChild>
              <Link href={perfilHref}>
                <User /> Meu perfil
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/seguranca/dois-fatores">
              <KeyRound /> Segurança e 2 etapas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Tema
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => definirTema(v as Tema)}>
                <DropdownMenuRadioItem value="light">
                  <Sun /> Claro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon /> Escuro
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor /> Do sistema
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => abrirAtalhos()}>
            <Keyboard /> Atalhos de teclado
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/manual" target="_blank" rel="noopener noreferrer">
              <BookOpen /> Manual do usuário
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {links.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {links.map((l) => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href}>
                  {l.icone === "plataforma" ? <Shield /> : <Building2 />} {l.rotulo}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void sair()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
