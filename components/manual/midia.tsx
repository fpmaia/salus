"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Maximize2, Pause, Play, X } from "lucide-react";
import dimensoes from "./dimensoes-telas.json";

const TAMANHOS = dimensoes as Record<string, { largura: number; altura: number }>;

/** Print de uma tela (public/manual/telas/<nome>.png), com legenda e ampliação ao clicar. */
export function Figura({ nome, legenda }: { nome: string; legenda: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tamanho = TAMANHOS[nome] ?? { largura: 1280, altura: 820 };
  const src = `/manual/telas/${nome}.png`;
  // Prints de celular ficam estreitos; os de página inteira, cortados na prévia (o zoom mostra tudo).
  const celular = tamanho.largura < 600;

  return (
    <figure className="flex flex-col gap-2 break-inside-avoid">
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className={`group relative overflow-hidden rounded-xl border border-border/80 bg-muted/30 text-left shadow-xs transition hover:border-primary/50 print:max-h-none ${
          celular ? "mx-auto w-full max-w-[260px]" : "w-full"
        } ${tamanho.altura / tamanho.largura > 1.1 && !celular ? "max-h-[520px]" : ""}`}
        aria-label={`Ampliar: ${legenda}`}
      >
        <Image
          src={src}
          alt={legenda}
          width={tamanho.largura}
          height={tamanho.altura}
          sizes={celular ? "260px" : "(max-width: 768px) 100vw, 820px"}
          className="h-auto w-full object-cover object-top"
        />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100 print:hidden">
          <Maximize2 className="size-3" /> Ampliar
        </span>
      </button>
      <figcaption className="text-xs text-muted-foreground">{legenda}</figcaption>
      <dialog
        ref={dialogo}
        className="m-auto max-h-[95vh] max-w-[95vw] rounded-xl bg-background p-0 shadow-2xl backdrop:bg-black/70"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close();
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-2 text-sm">
          <span className="font-medium">{legenda}</span>
          <button type="button" onClick={() => dialogo.current?.close()} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <Image src={src} alt={legenda} width={tamanho.largura} height={tamanho.altura} sizes="95vw" className="h-auto max-w-none" />
      </dialog>
    </figure>
  );
}

/**
 * Animação curta (public/manual/animacoes/<nome>.webm) com pôster. Toca sozinha, sem som e em
 * loop quando aparece na tela; com "reduzir movimento" ligado, só toca quando a pessoa pede.
 */
export function Animacao({ nome, legenda, celular = false }: { nome: string; legenda: string; celular?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);

  useEffect(() => {
    const elemento = video.current;
    if (!elemento) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) elemento.play().catch(() => undefined);
        else elemento.pause();
      },
      { threshold: 0.5 },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const alternar = () => {
    const elemento = video.current;
    if (!elemento) return;
    if (elemento.paused) elemento.play().catch(() => undefined);
    else elemento.pause();
  };

  return (
    <figure className={`flex flex-col gap-2 break-inside-avoid ${celular ? "mx-auto w-full max-w-[280px]" : ""}`}>
      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-muted/30 shadow-sm">
        <video
          ref={video}
          className="h-auto w-full print:hidden"
          src={`/manual/animacoes/${nome}.webm`}
          poster={`/manual/animacoes/${nome}.png`}
          muted
          loop
          playsInline
          preload="none"
          aria-label={`Animação: ${legenda}`}
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
        />
        {/* Na impressão, o pôster no lugar do vídeo. */}
        <Image
          src={`/manual/animacoes/${nome}.png`}
          alt={legenda}
          width={celular ? 390 : 1280}
          height={celular ? 844 : 720}
          className="hidden h-auto w-full print:block"
        />
        <button
          type="button"
          onClick={alternar}
          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm print:hidden"
        >
          {tocando ? <Pause className="size-3" /> : <Play className="size-3" />}
          {tocando ? "Pausar" : "Ver animação"}
        </button>
      </div>
      <figcaption className="text-xs text-muted-foreground">▶ {legenda}</figcaption>
    </figure>
  );
}
