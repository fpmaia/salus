"use client";

import { ThemeProvider } from "next-themes";

/**
 * Tema claro/escuro/sistema (classe .dark no <html>). O nonce da CSP vai para o script que
 * next-themes injeta antes da hidratação (evita o "piscar" de tema errado).
 */
export function ProvedorTema({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce} storageKey="salus-tema">
      {children}
    </ThemeProvider>
  );
}
