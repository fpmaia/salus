"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, Stethoscope, DoorOpen, Users, ArrowRight, Calculator, Building2 } from "lucide-react";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { PLANOS_PUBLICOS, planoMaisBarato, type PlanoPublico } from "@/src/domain/planos";

const DESCRICAO: Record<PlanoPublico["codigo"], string> = {
  basico: "Para consultórios e espaços com uma unidade.",
  pro: "Para coworkings de saúde e clínicas com até 3 unidades.",
  enterprise: "Para redes de clínicas e franquias de saúde.",
};

// O que existe em qualquer plano (os planos diferem só em limites e preços).
const EM_TODOS = [
  "Agenda de salas e recepção",
  "Contratos, fechamento do mês e cobrança por PIX",
  "Lembretes e confirmação por WhatsApp",
  "Agenda online, NFS-e e prontuário (módulos opcionais)",
];

const milhar = (n: number) => n.toLocaleString("pt-BR");
const extra = (n: number) => (n > 0 ? `${n} além do incluído` : "Incluído no plano");

export function PricingCalculator({ linkContato }: { linkContato: string }) {
  const [unidades, setUnidades] = useState(1);
  const [salas, setSalas] = useState(5);
  const [profissionais, setProfissionais] = useState(10);
  const [prontuarios, setProntuarios] = useState(3);
  const simulacao = planoMaisBarato({ unidades, salas, profissionais, prontuarios: Math.min(prontuarios, profissionais) });

  return (
    <section id="planos" className="relative px-4 py-24 sm:px-6 bg-muted/20 border-y border-border/60">
      <div className="mx-auto max-w-6xl space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary tracking-wide uppercase">
            <Sparkles className="size-3" /> Planos
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">Mensalidade previsível, sem fidelidade.</h2>
          <p className="text-base text-muted-foreground">
            Todos os planos têm os mesmos recursos. Muda o tamanho: unidades, salas e profissionais incluídos. Passou do limite de salas ou
            profissionais? Nada trava: o excedente entra na fatura do mês.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3 items-stretch">
          {PLANOS_PUBLICOS.map((p) => {
            const destaque = p.codigo === "pro";
            return (
              <div
                key={p.codigo}
                className={`relative rounded-3xl bg-card p-8 flex flex-col justify-between ${
                  destaque ? "border-2 border-primary shadow-xl" : "border border-border/80 shadow-sm"
                }`}
              >
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{p.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{DESCRICAO[p.codigo]}</p>
                  </div>
                  <div>
                    <span className={`text-4xl font-extrabold tracking-tight ${destaque ? "text-primary" : "text-foreground"}`}>
                      {formatarMoeda(p.precoMensalCentavos)}
                    </span>
                    <span className="text-xs text-muted-foreground"> / mês</span>
                  </div>
                  <ul className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>
                        <strong>{milhar(p.limites.unidades)}</strong> {p.limites.unidades === 1 ? "unidade" : "unidades"}
                        {p.permiteUnidadeExtra ? ` (+${formatarMoeda(p.precoUnidadeExtraCentavos)} cada extra)` : " (sem unidade extra)"}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>
                        <strong>{milhar(p.limites.salas)}</strong> salas (+{formatarMoeda(p.precoSalaExtraCentavos)} cada extra)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>
                        <strong>{milhar(p.limites.profissionais)}</strong> profissionais (+{formatarMoeda(p.precoProfissionalExtraCentavos)} cada extra)
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>Prontuário: {formatarMoeda(p.precoProntuarioCentavos)}/mês por profissional, após 15 dias grátis</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-8">
                  {p.codigo === "enterprise" ? (
                    <a
                      href={linkContato}
                      target={linkContato.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background py-3 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-xs"
                    >
                      Falar com a equipe
                    </a>
                  ) : (
                    <Link
                      href="/cadastro"
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${
                        destaque
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/25"
                          : "border border-border bg-background text-foreground hover:bg-muted shadow-xs"
                      }`}
                    >
                      Começar no {p.nome} {destaque && <ArrowRight className="size-3.5" />}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border bg-card p-5 text-xs text-muted-foreground">
          <span className="font-bold text-foreground">Em todos os planos: </span>
          {EM_TODOS.join(" · ")}. A fatura do Salus vence no dia 10 e é paga por PIX, boleto ou cartão.
        </div>

        <div className="rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 sm:p-8 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Calculator className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Simule o valor para o seu tamanho</h3>
                <p className="text-xs text-muted-foreground">Mostramos o plano mais barato para o seu uso, com os excedentes.</p>
              </div>
            </div>
            <div className="rounded-xl bg-card border px-4 py-2 text-right" aria-live="polite">
              <span className="text-[11px] text-muted-foreground block">
                Mais barato: <strong>Plano {simulacao.plano.nome}</strong>
              </span>
              <span className="text-xl font-extrabold text-primary tabular-nums">{formatarMoeda(simulacao.totalCentavos)}</span>
              <span className="text-[10px] text-muted-foreground"> / mês</span>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { rotulo: "Unidades", icone: Building2, valor: unidades, set: setUnidades, min: 1, max: 10, nota: extra(simulacao.unidadesExtras) },
              { rotulo: "Salas", icone: DoorOpen, valor: salas, set: setSalas, min: 1, max: 40, nota: extra(simulacao.salasExtras) },
              { rotulo: "Profissionais", icone: Users, valor: profissionais, set: setProfissionais, min: 1, max: 100, nota: extra(simulacao.profissionaisExtras) },
              { rotulo: "Prontuários pagos pelo espaço", icone: Stethoscope, valor: prontuarios, set: setProntuarios, min: 0, max: profissionais, nota: `${formatarMoeda(simulacao.plano.precoProntuarioCentavos)} cada, após 15 dias grátis` },
            ].map((c) => (
              <label key={c.rotulo} className="rounded-2xl border bg-card p-4 space-y-2 block">
                <span className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <c.icone className="size-3.5 text-primary" /> {c.rotulo}
                  </span>
                  <span className="font-bold text-primary tabular-nums">{Math.min(c.valor, c.max)}</span>
                </span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  value={Math.min(c.valor, c.max)}
                  onChange={(e) => c.set(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground block">{c.nota}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
