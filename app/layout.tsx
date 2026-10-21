import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Títulos: humanista, com mais personalidade que o texto corrido (Geist).
const titulos = Plus_Jakarta_Sans({
  variable: "--font-titulos",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const descricao = "Gestão de coworkings de saúde: salas, agenda e financeiro.";

// Ícones e imagem de compartilhamento vêm de app/icon.png, apple-icon.png e opengraph-image.png.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Salus", template: "%s · Salus" },
  description: descricao,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Salus", title: "Salus", description: descricao },
  twitter: { card: "summary_large_image", title: "Salus", description: descricao },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Ler o cabeçalho torna todas as páginas dinâmicas: o nonce da CSP (proxy.ts) muda a cada
  // requisição, e o Next.js só o aplica aos scripts de páginas renderizadas na hora.
  await headers();
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${titulos.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
