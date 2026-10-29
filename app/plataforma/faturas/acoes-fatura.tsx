import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ajustarFaturaAcao, alterarVencimentoAcao, baixaManualAcao, cancelarFaturaAcao, reenviarFaturaAcao } from "./actions";

type Fatura = { id: string; tenantId: string; status: string; vencimento: string };

function Opcao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-background">
      <summary className="cursor-pointer list-none px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted group-open:border-b">{titulo}</summary>
      <div className="p-3">{children}</div>
    </details>
  );
}

/** Operações numa fatura em aberto (Dono e Financeiro). Cada uma pede motivo e fica na auditoria. */
export function AcoesFatura({ fatura }: { fatura: Fatura }) {
  if (!["pendente", "vencida", "erro"].includes(fatura.status)) return null;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const p = `f-${fatura.id.slice(0, 8)}`;
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <Opcao titulo="Mudar vencimento">
        <FormAcao acao={alterarVencimentoAcao.bind(null, fatura.tenantId, fatura.id)} textoBotao="Salvar vencimento" className="flex flex-col gap-2">
          <Label htmlFor={`${p}-venc`} className="text-xs">Nova data</Label>
          <Input id={`${p}-venc`} name="vencimento" type="date" min={hoje} required defaultValue={fatura.vencimento >= hoje ? fatura.vencimento : hoje} />
          <Label htmlFor={`${p}-venc-motivo`} className="text-xs">Motivo</Label>
          <Input id={`${p}-venc-motivo`} name="motivo" required maxLength={300} placeholder="Ex.: pedido da clínica" />
        </FormAcao>
      </Opcao>
      <Opcao titulo="Desconto ou acréscimo">
        <FormAcao acao={ajustarFaturaAcao.bind(null, fatura.tenantId, fatura.id)} textoBotao="Ajustar valor" className="flex flex-col gap-2">
          <div className="flex gap-2">
            <NativeSelect name="sentido" aria-label="Tipo de ajuste" defaultValue="desconto">
              <option value="desconto">Desconto</option>
              <option value="acrescimo">Acréscimo</option>
            </NativeSelect>
            <Input name="valor" aria-label="Valor do ajuste em reais" inputMode="decimal" required placeholder="R$ 0,00" />
          </div>
          <Input name="descricao" aria-label="Descrição na fatura" required maxLength={200} placeholder="Texto na fatura (ex.: desconto comercial)" />
          <Input name="motivo" aria-label="Motivo interno" required maxLength={300} placeholder="Motivo interno" />
        </FormAcao>
      </Opcao>
      <Opcao titulo="Baixa manual (pago fora)">
        <FormAcao
          acao={baixaManualAcao.bind(null, fatura.tenantId, fatura.id)}
          textoBotao="Registrar pagamento"
          confirmar="Registrar como paga? A cobrança no Asaas será cancelada para não ser paga de novo."
          className="flex flex-col gap-2"
        >
          <Label htmlFor={`${p}-pago`} className="text-xs">Pago em</Label>
          <Input id={`${p}-pago`} name="pagoEm" type="date" max={hoje} required defaultValue={hoje} />
          <Input name="observacao" aria-label="Como foi pago" required maxLength={300} placeholder="Como foi pago (ex.: PIX direto)" />
        </FormAcao>
      </Opcao>
      <Opcao titulo="Cancelar fatura">
        <FormAcao
          acao={cancelarFaturaAcao.bind(null, fatura.tenantId, fatura.id)}
          textoBotao="Cancelar fatura"
          variante="destructive"
          confirmar="Cancelar esta fatura? Ela sai do Asaas e não será cobrada."
          className="flex flex-col gap-2"
        >
          <Input name="motivo" aria-label="Motivo do cancelamento" required maxLength={300} placeholder="Motivo" />
        </FormAcao>
      </Opcao>
      <Opcao titulo={fatura.status === "erro" ? "Enviar de novo ao Asaas" : "Reenviar por e-mail"}>
        <FormAcao acao={reenviarFaturaAcao.bind(null, fatura.tenantId, fatura.id)} textoBotao={fatura.status === "erro" ? "Enviar ao Asaas" : "Reenviar aos administradores"} textoPendente="Enviando…" />
      </Opcao>
    </div>
  );
}
