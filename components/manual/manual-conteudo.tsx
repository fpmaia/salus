"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Lightbulb, MapPin, Printer, Search, X } from "lucide-react";
import { Animacao, Figura } from "./midia";
import { GRUPOS, ROTULO_PERFIL, SECOES, type Perfil, type Secao } from "./secoes";

// Manual do usuário: índice por assunto, busca, filtro por perfil e uma seção por tarefa.
// O conteúdo fica em secoes.tsx; prints e animações em public/manual (npm run manual:telas).

const PERFIS: (Perfil | "todos")[] = ["todos", "admin", "recepcao", "profissional", "paciente", "plataforma"];

/** Texto pesquisável: sem acentos e em minúsculas. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function textoDaSecao(s: Secao): string {
  const problemas = (s.problemas ?? []).map((p) => p.sintoma).join(" ");
  const midias = (s.midias ?? []).map((m) => m.legenda).join(" ");
  return normalizar([s.titulo, s.resumo, s.onde ?? "", problemas, midias, ...(s.termos ?? [])].join(" "));
}

export function ManualConteudo() {
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState<Perfil | "todos">("todos");

  // Abrir /manual#secao (botão "Manual" do painel): mostra tudo e rola até a seção.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

  const indice = useMemo(() => new Map(SECOES.map((s) => [s.id, textoDaSecao(s)])), []);
  const termo = normalizar(busca.trim());
  const visiveis = SECOES.filter(
    (s) => (perfil === "todos" || s.perfis.includes(perfil)) && (!termo || termo.split(/\s+/).every((t) => indice.get(s.id)!.includes(t))),
  );
  const grupos = GRUPOS.map((g) => ({ ...g, secoes: visiveis.filter((s) => s.grupo === g.id) })).filter((g) => g.secoes.length > 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[230px_1fr]">
      {/* Índice (desktop) */}
      <nav aria-label="Índice do manual" className="hidden lg:block print:hidden">
        <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-4 overflow-y-auto pr-2 text-sm">
          {grupos.map((g) => (
            <div key={g.id} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</span>
              {g.secoes.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-md px-2 py-1 text-foreground/80 hover:bg-muted hover:text-foreground">
                  {s.titulo}
                </a>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col gap-8">
        {/* Busca e filtro */}
        <div className="flex flex-col gap-3 print:hidden">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="O que você quer fazer? Ex.: remarcar, fechar o mês, prontuário, plano"
              aria-label="Buscar no manual"
              className="w-full rounded-2xl border border-border/80 bg-card py-3.5 pl-12 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por perfil">
            <span className="mr-1 text-xs text-muted-foreground">Sou:</span>
            {PERFIS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={perfil === p}
                onClick={() => setPerfil(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  perfil === p ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {p === "todos" ? "Todos" : ROTULO_PERFIL[p]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.print()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Printer className="size-3.5" /> Imprimir / PDF
            </button>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {visiveis.length === SECOES.length ? `${SECOES.length} seções` : `${visiveis.length} de ${SECOES.length} seções`}
          </p>
        </div>

        {grupos.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            Nada encontrado para &ldquo;{busca}&rdquo;. Tente outra palavra, como &ldquo;agenda&rdquo;, &ldquo;contrato&rdquo; ou &ldquo;fatura&rdquo;.
          </div>
        ) : (
          grupos.map((g) => (
            <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="flex flex-col gap-6">
              <h2 id={`grupo-${g.id}`} className="border-b pb-2 text-xl font-bold tracking-tight">
                {g.titulo}
              </h2>
              {g.secoes.map((s) => (
                <ArtigoSecao key={s.id} secao={s} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ArtigoSecao({ secao: s }: { secao: Secao }) {
  return (
    <article id={s.id} className="scroll-mt-24 flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-7 print:break-inside-avoid-page print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {s.perfis.map((p) => (
            <span key={p} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {ROTULO_PERFIL[p]}
            </span>
          ))}
        </div>
        <h3 className="text-lg font-bold tracking-tight">
          <a href={`#${s.id}`} className="hover:underline">
            {s.titulo}
          </a>
        </h3>
        <p className="text-sm text-muted-foreground">{s.resumo}</p>
        {(s.onde || s.link) && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {s.onde && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-3.5" /> {s.onde}
              </span>
            )}
            {s.link && (
              <Link href={s.link} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline print:hidden">
                Abrir no sistema <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-6 text-sm leading-relaxed text-foreground/90 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          {s.passos && (
            <ol className="flex flex-col gap-2.5">
              {s.passos.map((passo, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{passo}</span>
                </li>
              ))}
            </ol>
          )}
          {s.conteudo}
          {s.dicas?.map((dica, i) => (
            <p key={i} className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
              <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden />
              <span>{dica}</span>
            </p>
          ))}
          {s.problemas && (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <AlertTriangle className="size-3.5 text-warning" aria-hidden /> {s.id === "faq" ? "Perguntas" : "Se algo der errado"}
              </span>
              <dl className="flex flex-col divide-y rounded-xl border text-xs">
                {s.problemas.map((p) => (
                  <div key={p.sintoma} className="flex flex-col gap-0.5 p-3">
                    <dt className="font-medium text-foreground">{p.sintoma}</dt>
                    <dd className="text-muted-foreground">{p.solucao}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {s.midias && s.midias.length > 0 && (
          <div className="flex flex-col gap-5">
            {s.midias.map((m) =>
              m.tipo === "animacao" ? (
                <Animacao key={m.nome} nome={m.nome} legenda={m.legenda} celular={m.celular} />
              ) : (
                <Figura key={m.nome} nome={m.nome} legenda={m.legenda} />
              ),
            )}
          </div>
        )}
      </div>
    </article>
  );
}
