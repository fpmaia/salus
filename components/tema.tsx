"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CHAVE_TEMA, type Tema } from "./tema-script";

// Tema claro/escuro/sistema: a escolha fica no localStorage e vira a classe .dark no <html>.
// O script de tema-script.ts aplica a classe antes da hidratação (sem "piscar").

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function lerTema(): Tema {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const sistemaEscuro = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function aplicar(tema: Tema) {
  const escuro = tema === "dark" || (tema === "system" && sistemaEscuro());
  document.documentElement.classList.toggle("dark", escuro);
  document.documentElement.style.colorScheme = escuro ? "dark" : "light";
}

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const sistema = () => {
    if (lerTema() === "system") aplicar("system");
    aoMudar();
  };
  const outraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE_TEMA) return;
    aplicar(lerTema());
    aoMudar();
  };
  mql.addEventListener("change", sistema);
  window.addEventListener("storage", outraAba);
  return () => {
    ouvintes.delete(aoMudar);
    mql.removeEventListener("change", sistema);
    window.removeEventListener("storage", outraAba);
  };
}

export function useTema(): { tema: Tema; temaResolvido: "light" | "dark"; definirTema: (t: Tema) => void } {
  const tema = useSyncExternalStore(assinar, lerTema, () => "system" as Tema);
  const escuro = useSyncExternalStore(
    assinar,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  const definirTema = useCallback((t: Tema) => {
    try {
      if (t === "system") localStorage.removeItem(CHAVE_TEMA);
      else localStorage.setItem(CHAVE_TEMA, t);
    } catch {
      // sem localStorage (navegação privada): vale só nesta página
    }
    aplicar(t);
    avisar();
  }, []);
  return { tema, temaResolvido: escuro ? "dark" : "light", definirTema };
}
