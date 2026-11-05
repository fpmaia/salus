"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTema } from "@/components/tema";
import { CalendarPlus, Loader2, Moon, Search, Sun, UserPlus, UserRound } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "./kbd";
import { iconeDaRota } from "./icones";

// Paleta de comandos (Ctrl/⌘+K) e atalhos "g + letra". Abrir de qualquer lugar: abrirPaleta().

const EVENTO_PALETA = "salus:paleta";
const EVENTO_ATALHOS = "salus:atalhos";
export const abrirPaleta = () => window.dispatchEvent(new Event(EVENTO_PALETA));
export const abrirAtalhos = () => window.dispatchEvent(new Event(EVENTO_ATALHOS));

export type ItemPaleta = { href: string; rotulo: string; grupo?: string };
export type AcaoPaleta = { href: string; rotulo: string; icone: "agendamento" | "paciente" };
type Paciente = { id: string; nome: string; detalhe: string };

/** "g" seguido de uma letra leva à página (só as que o usuário pode ver). */
export const ATALHOS_IR: { tecla: string; href: string; rotulo: string }[] = [
  { tecla: "i", href: "/painel", rotulo: "Início" },
  { tecla: "a", href: "/painel/agenda", rotulo: "Agenda" },
  { tecla: "t", href: "/painel/atendimentos", rotulo: "Atendimentos do dia" },
  { tecla: "p", href: "/painel/pacientes", rotulo: "Pacientes" },
  { tecla: "r", href: "/painel/prontuario", rotulo: "Prontuário" },
  { tecla: "f", href: "/painel/financeiro", rotulo: "Financeiro" },
];

const digitando = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName));

export function PaletaComandos({
  itens,
  acoes = [],
  buscarPacientes,
}: {
  itens: ItemPaleta[];
  acoes?: AcaoPaleta[];
  buscarPacientes?: (termo: string) => Promise<Paciente[]>;
}) {
  const router = useRouter();
  const { temaResolvido: resolvedTheme, definirTema: setTheme } = useTema();
  const [aberta, setAberta] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [termo, setTermo] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [buscando, iniciar] = useTransition();
  const esperandoG = useRef<number | null>(null);
  const atalhosValidos = useMemo(() => {
    const permitidos = new Set(itens.map((i) => i.href));
    return ATALHOS_IR.filter((a) => permitidos.has(a.href));
  }, [itens]);

  useEffect(() => {
    const abrir = () => setAberta(true);
    const verAtalhos = () => setAtalhos(true);
    const teclado = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
        return;
      }
      if (digitando(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setAtalhos(true);
        return;
      }
      if (esperandoG.current !== null) {
        window.clearTimeout(esperandoG.current);
        esperandoG.current = null;
        const destino = atalhosValidos.find((a) => a.tecla === e.key.toLowerCase());
        if (destino) {
          e.preventDefault();
          router.push(destino.href);
        }
        return;
      }
      if (e.key === "g") esperandoG.current = window.setTimeout(() => (esperandoG.current = null), 1200);
    };
    window.addEventListener(EVENTO_PALETA, abrir);
    window.addEventListener(EVENTO_ATALHOS, verAtalhos);
    window.addEventListener("keydown", teclado);
    return () => {
      window.removeEventListener(EVENTO_PALETA, abrir);
      window.removeEventListener(EVENTO_ATALHOS, verAtalhos);
      window.removeEventListener("keydown", teclado);
    };
  }, [router, atalhosValidos]);

  // Busca de pacientes com espera curta entre teclas.
  useEffect(() => {
    if (!buscarPacientes) return;
    const t = termo.trim();
    const timer = window.setTimeout(() => {
      if (t.length < 2) {
        setPacientes([]);
        return;
      }
      iniciar(async () => {
        try {
          setPacientes(await buscarPacientes(t));
        } catch {
          setPacientes([]);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [termo, buscarPacientes]);

  const ir = (href: string) => {
    setAberta(false);
    setTermo("");
    router.push(href);
  };

  const grupos = [...new Set(itens.map((i) => i.grupo ?? "Páginas"))];

  return (
    <>
      <CommandDialog
        open={aberta}
        onOpenChange={(a) => {
          setAberta(a);
          if (!a) setTermo("");
        }}
        title="Buscar no Salus"
        description="Páginas, ações e pacientes"
      >
        <Command>
          <CommandInput placeholder="Buscar páginas, ações ou pacientes…" value={termo} onValueChange={setTermo} />
          <CommandList>
            <CommandEmpty>{buscando ? "Buscando…" : "Nada encontrado."}</CommandEmpty>
            {buscarPacientes && (pacientes.length > 0 || buscando) && (
              <CommandGroup heading="Pacientes">
                {buscando && pacientes.length === 0 && (
                  <CommandItem disabled value={`buscando ${termo}`}>
                    <Loader2 className="animate-spin" /> Buscando pacientes…
                  </CommandItem>
                )}
                {pacientes.map((p) => (
                  <CommandItem key={p.id} value={`paciente ${p.id} ${p.nome} ${termo}`} onSelect={() => ir(`/painel/pacientes/${p.id}`)}>
                    <UserRound />
                    <span className="truncate">{p.nome}</span>
                    {p.detalhe && <span className="ml-auto truncate text-xs text-muted-foreground">{p.detalhe}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {acoes.length > 0 && (
              <CommandGroup heading="Ações rápidas">
                {acoes.map((a) => (
                  <CommandItem key={a.href} value={`acao ${a.rotulo}`} onSelect={() => ir(a.href)}>
                    {a.icone === "agendamento" ? <CalendarPlus /> : <UserPlus />}
                    {a.rotulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {grupos.map((g) => (
              <CommandGroup key={g} heading={g}>
                {itens
                  .filter((i) => (i.grupo ?? "Páginas") === g)
                  .map((i) => {
                    const Icone = iconeDaRota(i.href);
                    const atalho = atalhosValidos.find((a) => a.href === i.href);
                    return (
                      <CommandItem key={i.href} value={`${g} ${i.rotulo}`} onSelect={() => ir(i.href)}>
                        <Icone />
                        {i.rotulo}
                        {atalho && <CommandShortcut>G {atalho.tecla.toUpperCase()}</CommandShortcut>}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="Preferências">
              <CommandItem
                value="tema alternar claro escuro"
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  setAberta(false);
                }}
              >
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                {resolvedTheme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <Dialog open={atalhos} onOpenChange={setAtalhos}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
            <DialogDescription>Funcionam em qualquer tela, fora dos campos de texto.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col divide-y text-sm">
            <LinhaAtalho teclas={["Ctrl", "K"]} rotulo="Buscar páginas, ações e pacientes" />
            <LinhaAtalho teclas={["Ctrl", "B"]} rotulo="Recolher ou abrir o menu lateral" />
            {atalhosValidos.map((a) => (
              <LinhaAtalho key={a.tecla} teclas={["G", a.tecla.toUpperCase()]} rotulo={`Ir para ${a.rotulo}`} />
            ))}
            <LinhaAtalho teclas={["?"]} rotulo="Mostrar esta lista" />
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinhaAtalho({ teclas, rotulo }: { teclas: string[]; rotulo: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span>{rotulo}</span>
      <span className="flex items-center gap-1">
        {teclas.map((t) => (
          <Kbd key={t}>{t}</Kbd>
        ))}
      </span>
    </li>
  );
}

/** Botão de busca da barra superior (abre a paleta). Compacto: só o ícone (celular). */
export function BotaoBusca({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <button
        type="button"
        onClick={abrirPaleta}
        aria-label="Buscar"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Search className="size-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={abrirPaleta}
      className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">Buscar…</span>
      <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
