import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Salus",
  description: "Gestão de coworkings de saúde: salas, agenda e financeiro.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Ler o cabeçalho torna todas as páginas dinâmicas: o nonce da CSP (proxy.ts) muda a cada
  // requisição, e o Next.js só o aplica aos scripts de páginas renderizadas na hora.
  await headers();
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
