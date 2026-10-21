"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

// Avisos (toasts) do painel: a confirmação de uma ação continua visível mesmo quando o
// formulário que a disparou some ou remonta. Erros ficam no próprio formulário.

type Aviso = { id: number; texto: string };

const Contexto = createContext<((texto: string) => void) | null>(null);

/** null fora do painel (páginas públicas): quem usa mostra a mensagem no próprio lugar. */
export function useAviso() {
  return useContext(Contexto);
}

let proximoId = 1;

export function ProvedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const fechar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);
  const avisar = useCallback(
    (texto: string) => {
      const id = proximoId++;
      setAvisos((lista) => [...lista.slice(-2), { id, texto }]);
      setTimeout(() => fechar(id), 6000);
    },
    [fechar],
  );

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border border-success/30 bg-background px-4 py-3 text-sm shadow-lg"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span className="flex-1">{a.texto}</span>
            <button type="button" onClick={() => fechar(a.id)} aria-label="Fechar aviso" className="rounded p-0.5 text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
