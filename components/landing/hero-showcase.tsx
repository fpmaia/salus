"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Lock,
  Stethoscope,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Building2,
  CheckCircle2,
} from "lucide-react";

type AbaHero = "recepcao" | "prontuario" | "financeiro";

export function HeroShowcase() {
  const [abaAtiva, setAbaAtiva] = useState<AbaHero>("recepcao");

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-3 sm:p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* Luz ambiente de fundo (Glow effect) */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl opacity-60" />

      {/* Barra de controle do simulador (Abas interativas) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-1.5">
          <div className="size-3 rounded-full bg-destructive/60" />
          <div className="size-3 rounded-full bg-warning/60" />
          <div className="size-3 rounded-full bg-success/60" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground hidden sm:inline">
            salus.app / visualização ao vivo
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 text-xs">
          <button
            onClick={() => setAbaAtiva("recepcao")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all ${
              abaAtiva === "recepcao"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="size-3.5 text-primary" /> Recepção
          </button>
          <button
            onClick={() => setAbaAtiva("prontuario")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all ${
              abaAtiva === "prontuario"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Stethoscope className="size-3.5 text-emerald-500" /> Prontuário EHR
          </button>
          <button
            onClick={() => setAbaAtiva("financeiro")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all ${
              abaAtiva === "financeiro"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="size-3.5 text-amber-500" /> Ocupação & PIX
          </button>
        </div>
      </div>

      {/* Conteúdo Dinâmico das Abas */}
      <div className="pt-4 min-h-[340px]">
        {/* Aba 1: Recepção em Tempo Real */}
        {abaAtiva === "recepcao" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Calendar className="size-4 text-primary" /> Grade de Salas de Hoje
                </h4>
                <p className="text-xs text-muted-foreground">Recepção ágil: paciente chega, você confirma em 1 clique.</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> 84% Ocupado
                </span>
                <span className="text-muted-foreground">3 salas livres agora</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border bg-muted/30 p-2.5">
                <span className="text-lg font-bold text-foreground tabular-nums block">28</span>
                <span className="text-[11px] text-muted-foreground">Agendamentos hoje</span>
              </div>
              <div className="rounded-xl border bg-muted/30 p-2.5">
                <span className="text-lg font-bold text-emerald-600 tabular-nums block">24</span>
                <span className="text-[11px] text-muted-foreground">Confirmados</span>
              </div>
              <div className="rounded-xl border bg-muted/30 p-2.5">
                <span className="text-lg font-bold text-primary tabular-nums block">0</span>
                <span className="text-[11px] text-muted-foreground">Atrasos na recepção</span>
              </div>
            </div>

            <div className="rounded-xl border divide-y overflow-hidden text-xs">
              <div className="flex items-center justify-between p-3 bg-muted/20">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-foreground">09:00</span>
                  <div>
                    <span className="font-semibold text-foreground block">Mariana Silveira</span>
                    <span className="text-[11px] text-muted-foreground">Dra. Camila Nogueira · Sala 02 (Consultório)</span>
                  </div>
                </div>
                <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  Na Recepção
                </span>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-foreground">09:30</span>
                  <div>
                    <span className="font-semibold text-foreground block">Lucas Albuquerque</span>
                    <span className="text-[11px] text-muted-foreground">Dr. Rodrigo Prado · Sala 01 (Atendimento)</span>
                  </div>
                </div>
                <span className="rounded-md bg-primary/15 px-2.5 py-1 font-semibold text-primary">
                  Confirmado via WhatsApp
                </span>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-foreground">10:00</span>
                  <div>
                    <span className="font-semibold text-foreground block">Fernanda Mattos</span>
                    <span className="text-[11px] text-muted-foreground">Dra. Helena Vaz · Sala 04 (Psicologia)</span>
                  </div>
                </div>
                <span className="rounded-md bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-600 dark:text-amber-400">
                  Lembrete Enviado
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Aba 2: Prontuário Eletrônico Cifrado */}
        {abaAtiva === "prontuario" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Lock className="size-4 text-emerald-500" /> Prontuário Cifrado e Auditado
                </h4>
                <p className="text-xs text-muted-foreground">
                  Conteúdo cifrado, registro imutável depois de finalizado e correções por adendo auditado.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="size-3.5" /> Chave Exclusiva do Médico
              </span>
            </div>

            <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2 text-xs">
                <div>
                  <span className="font-bold text-foreground block">Paciente: Ana Paula Ferreira (42 anos)</span>
                  <span className="text-muted-foreground">Evolução Clínica #14 · 27/10/2026 às 11:15</span>
                </div>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-mono text-[10px] font-semibold">
                  Hash SHA-256 Validado
                </span>
              </div>

              <div className="space-y-2 text-xs text-foreground/90">
                <p className="bg-background/80 rounded-lg p-2.5 border">
                  <strong className="text-primary block mb-0.5">Anamnese & Exame Físico:</strong>
                  Paciente relata melhora das cefaleias tensionais após adequação posológica. PA 120/80 mmHg, ausculta limpa. Sem queixas digestivas associadas.
                </p>
                <p className="bg-background/80 rounded-lg p-2.5 border">
                  <strong className="text-emerald-600 block mb-0.5">Prescrição & Conduta:</strong>
                  Mantida terapêutica atual. Solicitados exames laboratoriais de controle para 60 dias. Retorno agendado.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="size-3.5" /> Assinado digitalmente · Registro imutável
                </span>
                <span>Anexos: 2 laudos PDF cifrados</span>
              </div>
            </div>
          </div>
        )}

        {/* Aba 3: Ocupação e Faturamento PIX */}
        {abaAtiva === "financeiro" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Wallet className="size-4 text-amber-500" /> Automação de Locação & Baixa PIX
                </h4>
                <p className="text-xs text-muted-foreground">Contratos convertidos automaticamente em cobrança no dia 1º.</p>
              </div>
              <span className="text-xs font-bold text-emerald-600">
                +R$ 24.890,00 no mês
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
                <span className="font-semibold text-foreground block">Ocupação por Sala</span>
                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Sala 01 · Cirúrgica</span>
                      <strong className="text-foreground">92%</strong>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                      <div className="h-full bg-primary rounded-full" style={{ width: "92%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Sala 02 · Atendimento Clínico</span>
                      <strong className="text-foreground">78%</strong>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                      <div className="h-full bg-primary rounded-full" style={{ width: "78%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Sala 03 · Terapia & Psicologia</span>
                      <strong className="text-foreground">64%</strong>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                      <div className="h-full bg-primary rounded-full" style={{ width: "64%" }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
                <span className="font-semibold text-foreground block">Extrato do Profissional (Visão App)</span>
                <div className="rounded-lg bg-background p-2.5 border space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>16h reservadas × R$ 45,00/h</span>
                    <strong className="text-foreground">R$ 720,00</strong>
                  </div>
                  <div className="flex justify-between text-[11px] text-emerald-600">
                    <span>Pagamento Instantâneo PIX</span>
                    <strong>− R$ 720,00</strong>
                  </div>
                  <div className="border-t pt-1 flex justify-between items-center text-xs">
                    <span className="font-semibold text-foreground">Saldo do Período:</span>
                    <span className="rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5 font-bold text-[10px]">
                      Quitado
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé do mockup */}
      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Building2 className="size-3.5 text-primary" />
          Compatível com Consultórios Individuais e Redes Multi-Clínicas
        </span>
        <span className="font-medium text-foreground">
          Simulação interativa
        </span>
      </div>
    </div>
  );
}
