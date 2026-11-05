"use client";

import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

// Avisos (toasts) do painel: a confirmação de uma ação continua visível mesmo quando o
// formulário que a disparou some ou remonta. Erros também aparecem no próprio formulário.

export type OpcoesAviso = {
  tipo?: "sucesso" | "erro" | "info";
  /** Ação no próprio aviso (ex.: "Desfazer"). */
  acao?: { rotulo: string; aoClicar: () => void };
  descricao?: string;
};

export type Avisar = (texto: string, opcoes?: OpcoesAviso) => void;

const Contexto = createContext<Avisar | null>(null);

/** null fora do painel (páginas públicas): quem usa mostra a mensagem no próprio lugar. */
export function useAviso() {
  return useContext(Contexto);
}

const avisar: Avisar = (texto, { tipo = "sucesso", acao, descricao } = {}) => {
  const opcoes = {
    description: descricao,
    action: acao ? { label: acao.rotulo, onClick: acao.aoClicar } : undefined,
    duration: tipo === "erro" ? 8000 : 6000,
  };
  if (tipo === "erro") toast.error(texto, opcoes);
  else if (tipo === "info") toast.info(texto, opcoes);
  else toast.success(texto, opcoes);
};

export function ProvedorAvisos({ children }: { children: React.ReactNode }) {
  return (
    <Contexto.Provider value={avisar}>
      {children}
      {/* A região do Sonner já é aria-live: leitores de tela anunciam cada aviso. */}
      <Toaster position="bottom-right" closeButton visibleToasts={3} containerAriaLabel="Avisos" />
    </Contexto.Provider>
  );
}
