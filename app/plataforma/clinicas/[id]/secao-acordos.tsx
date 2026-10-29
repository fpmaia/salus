import { Handshake } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { AcordoComParcelas } from "@/src/server/plataforma-acordos";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "@/app/painel/financeiro/componentes";
import { cancelarAcordoAcao } from "./acordos-actions";
import { FormRenegociacao } from "./form-renegociacao";

const ROTULO_ACORDO = {
  ativo: { texto: "Ativo", classe: "bg-primary/10 text-primary" },
  quitado: { texto: "Quitado", classe: "bg-success/15 text-success" },
  cancelado: { texto: "Cancelado", classe: "bg-muted text-muted-foreground" },
} as const;

const ROTULO_PARCELA: Record<string, string> = {
  pendente: "em aberto",
  vencida: "vencida",
  paga: "paga",
  cancelada: "cancelada",
  erro: "erro de envio",
  estornada: "estornada",
};

type FaturaAberta = { id: string; competencia: string; tipo: string; vencimento: string; valorCentavos: number };

/** Acordos de renegociação da clínica e o formulário para renegociar o que está em aberto. */
export function SecaoAcordos({
  tenantId,
  acordos,
  abertas,
  podeEditar,
}: {
  tenantId: string;
  acordos: AcordoComParcelas[];
  abertas: FaturaAberta[];
  podeEditar: boolean;
}) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Handshake className="size-4 text-primary" /> Acordos de renegociação
        </h2>
        <p className="text-xs text-muted-foreground">
          As faturas escolhidas são canceladas e viram parcelas. Parcela em atraso segue a carência normal; pagas todas, o acordo quita sozinho.
        </p>
      </div>

      {acordos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum acordo.</p>
      ) : (
        <ul className="space-y-3">
          {acordos.map((a) => (
            <li key={a.id} className="space-y-2 rounded-xl border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROTULO_ACORDO[a.status].classe}`}>{ROTULO_ACORDO[a.status].texto}</span>
                  <strong>
                    {formatarMoeda(a.valorFinalCentavos)} em {a.parcelas}x
                  </strong>
                  <span className="text-muted-foreground">
                    (era {formatarMoeda(a.valorOriginalCentavos)}
                    {a.descontoCentavos > 0 ? `, desconto de ${formatarMoeda(a.descontoCentavos)}` : ""}) · {a.motivo}
                  </span>
                </span>
                <span className="text-muted-foreground">criado em {a.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              </div>
              <p className="text-muted-foreground">Substituiu: {a.originais.map((f) => rotuloCompetencia(f.competencia)).join(", ") || "—"}</p>
              <ul className="divide-y rounded-lg border">
                {a.parcelasFaturas.map((p, i) => (
                  <li key={p.id} className="flex justify-between px-3 py-1">
                    <span>
                      {i + 1}/{a.parcelas} · vence {formatarDataBr(p.vencimento)} · {ROTULO_PARCELA[p.status] ?? p.status}
                    </span>
                    <strong>{formatarMoeda(p.valorCentavos)}</strong>
                  </li>
                ))}
              </ul>
              {podeEditar && a.status === "ativo" && (
                <FormAcao
                  acao={cancelarAcordoAcao.bind(null, tenantId, a.id)}
                  textoBotao="Cancelar acordo"
                  variante="outline"
                  confirmar="Cancelar o acordo? As parcelas em aberto são canceladas no Asaas; as faturas originais não voltam."
                  className="flex flex-wrap items-end gap-2"
                >
                  <Input name="motivo" aria-label="Motivo do cancelamento do acordo" required maxLength={300} placeholder="Motivo" className="w-64" />
                </FormAcao>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar &&
        (abertas.length > 0 ? (
          <details className="rounded-xl border bg-muted/20">
            <summary className="cursor-pointer list-none px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted">Renegociar faturas em aberto</summary>
            <div className="border-t p-4">
              <FormRenegociacao
                tenantId={tenantId}
                hoje={hoje}
                faturas={abertas.map((f) => ({
                  id: f.id,
                  rotulo: f.tipo === "mensal" ? rotuloCompetencia(f.competencia) : f.tipo === "avulsa" ? "Avulsa" : "Parcela",
                  vencimento: f.vencimento,
                  valorCentavos: f.valorCentavos,
                }))}
              />
            </div>
          </details>
        ) : (
          <p className="text-xs text-muted-foreground">Sem faturas em aberto para renegociar.</p>
        ))}
    </div>
  );
}
