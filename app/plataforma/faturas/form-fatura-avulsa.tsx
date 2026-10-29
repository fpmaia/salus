import { FilePlus2 } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { faturaAvulsaAcao } from "./actions";

/** Cobrança fora da mensalidade (implantação, treinamento…): até 3 itens, enviada ao Asaas na hora. */
export function FormFaturaAvulsa({ tenantId }: { tenantId: string }) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <details className="rounded-xl border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted">
        <FilePlus2 className="size-3.5 text-primary" /> Nova fatura avulsa
      </summary>
      <div className="border-t p-4">
        <FormAcao acao={faturaAvulsaAcao.bind(null, tenantId)} textoBotao="Criar e enviar" textoPendente="Enviando…" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <Input name="itemDescricao" aria-label={`Descrição do item ${i + 1}`} required={i === 0} maxLength={200} placeholder={i === 0 ? "Ex.: implantação e treinamento" : "Outro item (opcional)"} />
              <Input name="itemValor" aria-label={`Valor do item ${i + 1}`} required={i === 0} inputMode="decimal" placeholder="R$ 0,00" />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`avulsa-venc-${tenantId}`} className="text-xs">Vencimento</Label>
              <Input id={`avulsa-venc-${tenantId}`} name="vencimento" type="date" min={hoje} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`avulsa-obs-${tenantId}`} className="text-xs">Do que é (aparece no Asaas)</Label>
              <Input id={`avulsa-obs-${tenantId}`} name="observacao" required maxLength={200} placeholder="Implantação Salus" />
            </div>
          </div>
        </FormAcao>
      </div>
    </details>
  );
}
