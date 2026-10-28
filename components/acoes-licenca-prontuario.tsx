import { CreditCard, ExternalLink } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { EstadoLicencaProntuario } from "@/src/domain/cobranca";
import {
  ativarMeuProntuarioTrialAcao,
  confirmarPagamentoProntuarioAcao,
  gerarCobrancaProntuarioAcao,
} from "@/app/painel/prontuario/actions";

export type StatusLicencaAcoes = {
  profissionalId: string;
  estado: EstadoLicencaProntuario;
  responsavel: "espaco" | "profissional";
  jaTeveTeste: boolean;
  statusPagamento: string;
  invoiceUrl: string | null;
  valorCentavos: number;
};

/** Botões da licença do profissional: testar, assinar, pagar a cobrança aberta e confirmar. */
export function AcoesLicencaProntuario({ status }: { status: StatusLicencaAcoes }) {
  const valor = formatarMoeda(status.valorCentavos);
  // Licença ativa paga pelo espaço: nada a fazer pelo profissional.
  if (status.responsavel === "espaco" && status.estado !== "inativa") return null;

  if (status.statusPagamento === "pendente") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {status.invoiceUrl && (
          <a
            href={status.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <CreditCard className="size-3.5" />
            Pagar por Pix ou cartão ({valor})
            <ExternalLink className="size-3 opacity-80" />
          </a>
        )}
        <FormAcao
          acao={confirmarPagamentoProntuarioAcao.bind(null, status.profissionalId)}
          textoBotao="Já paguei, ativar"
          textoPendente="Verificando pagamento…"
          variante="outline"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status.estado === "inativa" && !status.jaTeveTeste && (
        <FormAcao
          acao={ativarMeuProntuarioTrialAcao.bind(null, status.profissionalId)}
          textoBotao="Começar 15 dias grátis"
          textoPendente="Ativando…"
          variante="outline"
        />
      )}
      <FormAcao
        acao={gerarCobrancaProntuarioAcao.bind(null, status.profissionalId)}
        textoBotao={status.estado === "ativa" ? `Pagar mais 30 dias (${valor})` : `Assinar por ${valor} a cada 30 dias`}
        textoPendente="Gerando cobrança…"
        variante="default"
      />
    </div>
  );
}
