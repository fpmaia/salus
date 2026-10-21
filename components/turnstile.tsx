"use client";

import { useEffect, useRef } from "react";

// Widget do Cloudflare Turnstile. Sem chave (dev/testes) não renderiza nada.
// Dentro de um <form>, o widget põe o token no campo oculto "cf-turnstile-response".
// O token vale uma vez: depois de cada envio do formulário, o widget gera outro.

type OpcoesWidget = {
  sitekey: string;
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opcoes: OpcoesWidget) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

let carregando: Promise<void> | null = null;

/** Script criado por código do app: aceito pela CSP com 'strict-dynamic' (src/seguranca/cabecalhos.ts). */
function carregarScript(): Promise<void> {
  carregando ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      carregando = null;
      reject(new Error("Falha ao carregar o Turnstile"));
    };
    document.head.appendChild(script);
  });
  return carregando;
}

export function Turnstile({ chaveSite, acao, aoMudar }: { chaveSite: string | null; acao?: string; aoMudar?: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(aoMudar);
  useEffect(() => {
    callback.current = aoMudar;
  });

  useEffect(() => {
    const el = ref.current;
    if (!chaveSite || !el) return;
    let id: string | undefined;
    let ativo = true;
    const form = el.closest("form");
    // Depois do envio (FormData já lido), pede um token novo.
    const renovar = () => setTimeout(() => id && window.turnstile?.reset(id), 0);
    form?.addEventListener("submit", renovar);
    carregarScript()
      .then(() => {
        if (!ativo || !window.turnstile) return;
        id = window.turnstile.render(el, {
          sitekey: chaveSite,
          action: acao,
          callback: (token) => callback.current?.(token),
          "expired-callback": () => callback.current?.(""),
          "error-callback": () => callback.current?.(""),
        });
      })
      .catch(() => callback.current?.(""));
    return () => {
      ativo = false;
      form?.removeEventListener("submit", renovar);
      if (id) window.turnstile?.remove(id);
    };
  }, [chaveSite, acao]);

  if (!chaveSite) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
