"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Sparkles,
  Lock,
  FileCheck2,
  Clock,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  X,
  CreditCard,
  ShieldAlert,
} from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { EstadoLicencaProntuario } from "@/src/domain/cobranca";
import { Button } from "@/components/ui/button";
import {
  ativarMeuProntuarioTrialAcao,
  gerarCobrancaProntuarioAcao,
  confirmarPagamentoProntuarioAcao,
} from "@/app/painel/prontuario/actions";

export type StatusProntuarioBanner = {
  possuiPerfilProfissional: true;
  profissionalId: string;
  profissionalNome: string;
  profissionalEmail?: string | null;
  profissionalAtivo: boolean;
  estado: EstadoLicencaProntuario;
  responsavel: "espaco" | "profissional";
  jaTeveTeste: boolean;
  ativo: boolean;
  emTrial: boolean;
  trialFimEm: Date | null;
  diasRestantes: number;
  statusPagamento: string;
  asaasPaymentId: string | null;
  invoiceUrl: string | null;
  valorCentavos: number;
  pagoEm: Date | null;
};

export function BannerProntuarioProfissional({
  status,
}: {
  status: StatusProntuarioBanner;
}) {
  const [dispensado, setDispensado] = useState(false);
  const [gerandoCobranca, startGerarCobranca] = useTransition();
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Se já está ativo e pago (não trial), e foi dispensado, oculta
  if (dispensado) return null;

  const valor = formatarMoeda(status.valorCentavos);
  // Ativa (paga pelo espaço ou pelo profissional em dia): só uma barra compacta, que pode ser fechada.
  if (status.estado === "ativa") {
    return (
      <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-800 dark:text-emerald-300 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <strong>Prontuário Eletrônico Ativo:</strong> Seu prontuário individual, cifrado e só seu, está liberado.
            </span>
            <Link
              href="/painel/prontuario"
              className="ml-2 font-semibold underline underline-offset-2 hover:opacity-80"
            >
              Acessar Prontuário →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setDispensado(true)}
            className="rounded p-1 text-emerald-700/70 hover:bg-emerald-500/20 hover:text-emerald-900 dark:text-emerald-300"
            title="Ocultar aviso"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const handleGerarCobranca = () => {
    setMensagemErro(null);
    setMensagemSucesso(null);
    startGerarCobranca(async () => {
      const res = await gerarCobrancaProntuarioAcao(status.profissionalId);
      if (res.sucesso) {
        setMensagemSucesso(res.sucesso);
      } else if (res.erro) {
        setMensagemErro(res.erro);
      }
    });
  };

  return (
    <aside
      aria-label="Aviso de Prontuário Eletrônico"
      className="relative border-b border-primary/20 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-background px-4 py-3.5 print:hidden"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Lado Esquerdo: Identificação e Proposta de Valor */}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <Stethoscope className="size-5" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                Prontuário Eletrônico Profissional
              </span>

              {status.emTrial ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <Clock className="size-3" /> Degustação: {status.diasRestantes} {status.diasRestantes === 1 ? "dia restante" : "dias restantes"}
                </span>
              ) : status.statusPagamento === "pendente" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning border border-warning/30">
                  <CreditCard className="size-3" /> Pagamento pendente ({valor})
                </span>
              ) : status.estado === "aguardando_pagamento" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning border border-warning/30">
                  <CreditCard className="size-3" /> Pagamento vencido: só leitura
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/25">
                  <Sparkles className="size-3" /> {valor} a cada 30 dias
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Prontuário cifrado, com registros imutáveis e acessos auditados: somente você acessa as anotações dos seus pacientes (nem os administradores da clínica conseguem ler).
            </p>

            {/* Micro benefícios */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1 text-foreground/80">
                <Lock className="size-3 text-primary" /> Dados cifrados
              </span>
              <span className="flex items-center gap-1 text-foreground/80">
                <FileCheck2 className="size-3 text-primary" /> Prescrições & Laudos
              </span>
              <span className="flex items-center gap-1 text-foreground/80">
                <Sparkles className="size-3 text-emerald-600 dark:text-emerald-400" /> Sem fidelidade
              </span>
            </div>

            {mensagemSucesso && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 pt-1">
                ✓ {mensagemSucesso}
              </p>
            )}
            {mensagemErro && (
              <p className="text-xs font-medium text-destructive pt-1 flex items-center gap-1">
                <ShieldAlert className="size-3.5" /> {mensagemErro}
              </p>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações Contextuais */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center shrink-0">
          {/* Se o pagamento está pendente e já temos link da fatura */}
          {status.statusPagamento === "pendente" && status.invoiceUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={status.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                <CreditCard className="size-3.5" />
                <span>Pagar por Pix ou cartão ({valor})</span>
                <ExternalLink className="size-3 opacity-80" />
              </a>

              <FormAcao
                acao={confirmarPagamentoProntuarioAcao.bind(null, status.profissionalId)}
                textoBotao="Já paguei, ativar prontuário"
                textoPendente="Verificando pagamento…"
                variante="outline"
              />
            </div>
          ) : status.estado === "inativa" || status.estado === "aguardando_pagamento" ? (
            /* Sem licença válida: testar (só na primeira vez) ou assinar */
            <div className="flex flex-wrap items-center gap-2">
              {status.estado === "inativa" && !status.jaTeveTeste && (
                <FormAcao
                  acao={ativarMeuProntuarioTrialAcao.bind(null, status.profissionalId)}
                  textoBotao="Experimentar 15 dias grátis"
                  textoPendente="Ativando teste…"
                  variante="outline"
                />
              )}

              <Button
                type="button"
                onClick={handleGerarCobranca}
                disabled={gerandoCobranca}
                size="sm"
                className="text-xs font-semibold shadow"
              >
                {gerandoCobranca ? (
                  <>
                    <RefreshCw className="size-3 animate-spin mr-1.5" />
                    Gerando cobrança…
                  </>
                ) : (
                  <>
                    <CreditCard className="size-3.5 mr-1.5" />
                    Assinar por {valor}
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Em Trial: pode antecipar a assinatura paga para não interromper */
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/painel/prontuario"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent transition-colors"
              >
                <span>Acessar Prontuário</span>
                <ChevronRight className="size-3 text-muted-foreground" />
              </Link>

              {status.responsavel === "profissional" && (
              <Button
                type="button"
                onClick={handleGerarCobranca}
                disabled={gerandoCobranca}
                size="sm"
                className="text-xs font-semibold shadow bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {gerandoCobranca ? (
                  <>
                    <RefreshCw className="size-3 animate-spin mr-1.5" />
                    Gerando fatura…
                  </>
                ) : (
                  <>
                    <CreditCard className="size-3.5 mr-1.5" />
                    Garantir assinatura depois do teste
                  </>
                )}
              </Button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setDispensado(true)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground ml-1"
            title="Minimizar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
