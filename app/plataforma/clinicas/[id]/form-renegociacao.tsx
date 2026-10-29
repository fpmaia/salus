"use client";

import { useActionState, useMemo, useState } from "react";
import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { descontoDoAcordo, MAXIMO_PARCELAS_ACORDO, simularAcordo, validarAcordo } from "@/src/domain/acordos";
import { formatarMoeda, lerMoeda } from "@/src/domain/dinheiro";
import type { EstadoAcao } from "@/src/server/acao";
import { criarAcordoAcao } from "./acordos-actions";

const INICIAL: EstadoAcao = { erro: null, sucesso: null };

type FaturaAberta = { id: string; rotulo: string; vencimento: string; valorCentavos: number };
type Parcela = { valorCentavos: number; vencimento: string };

function dataBr(d: string) {
  return d.split("-").reverse().join("/");
}

/** Renegociar: escolhe as faturas em aberto, desconto e parcelas; a prévia é editável antes de confirmar. */
export function FormRenegociacao({ tenantId, faturas, hoje }: { tenantId: string; faturas: FaturaAberta[]; hoje: string }) {
  const [estado, acao, pendente] = useActionState(criarAcordoAcao.bind(null, tenantId), INICIAL);
  const [selecionadas, setSelecionadas] = useState<string[]>(faturas.map((f) => f.id));
  const [tipoDesconto, setTipoDesconto] = useState<"percentual" | "valor">("percentual");
  const [valorDesconto, setValorDesconto] = useState("");
  const [qtd, setQtd] = useState(3);
  const [primeiro, setPrimeiro] = useState(hoje);
  const [editadas, setEditadas] = useState<Parcela[] | null>(null);

  const total = faturas.filter((f) => selecionadas.includes(f.id)).reduce((t, f) => t + f.valorCentavos, 0);
  const desconto = descontoDoAcordo(total, {
    tipo: tipoDesconto,
    valor: tipoDesconto === "valor" ? (lerMoeda(valorDesconto) ?? 0) : Number(valorDesconto.replace(",", ".")) || 0,
  });
  const simuladas = useMemo(
    () => (total > 0 && qtd >= 1 ? simularAcordo({ valorOriginalCentavos: total, descontoCentavos: desconto, parcelas: qtd, primeiroVencimento: primeiro }).parcelas : []),
    [total, desconto, qtd, primeiro],
  );
  // Mudou a base (faturas, desconto, parcelas, data): a edição manual recomeça da simulação.
  const parcelas = editadas && editadas.length === simuladas.length ? editadas : simuladas;
  const problema = total > 0 ? validarAcordo({ valorOriginalCentavos: total, descontoCentavos: desconto, parcelas, hoje }) : "Escolha ao menos uma fatura";

  const reiniciar = () => setEditadas(null);
  const editar = (i: number, mudanca: Partial<Parcela>) => setEditadas(parcelas.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));

  return (
    <form action={acao} className="flex flex-col gap-4 text-xs">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-semibold text-foreground">Faturas que entram no acordo</legend>
        {faturas.map((f) => (
          <label key={f.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selecionadas.includes(f.id)}
                onChange={(e) => {
                  setSelecionadas(e.target.checked ? [...selecionadas, f.id] : selecionadas.filter((id) => id !== f.id));
                  reiniciar();
                }}
              />
              {f.rotulo} · venceu {dataBr(f.vencimento)}
            </span>
            <strong>{formatarMoeda(f.valorCentavos)}</strong>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ac-tipo-${tenantId}`} className="text-xs">Desconto</Label>
          <NativeSelect id={`ac-tipo-${tenantId}`} value={tipoDesconto} onChange={(e) => (setTipoDesconto(e.target.value as "percentual" | "valor"), reiniciar())}>
            <option value="percentual">Percentual (%)</option>
            <option value="valor">Valor (R$)</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ac-desc-${tenantId}`} className="text-xs">{tipoDesconto === "percentual" ? "% de desconto" : "R$ de desconto"}</Label>
          <Input id={`ac-desc-${tenantId}`} inputMode="decimal" value={valorDesconto} placeholder="0" onChange={(e) => (setValorDesconto(e.target.value), reiniciar())} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ac-qtd-${tenantId}`} className="text-xs">Parcelas</Label>
          <Input id={`ac-qtd-${tenantId}`} type="number" min={1} max={MAXIMO_PARCELAS_ACORDO} value={qtd} onChange={(e) => (setQtd(Math.max(1, Math.min(MAXIMO_PARCELAS_ACORDO, Number(e.target.value) || 1))), reiniciar())} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ac-primeiro-${tenantId}`} className="text-xs">1ª parcela vence</Label>
          <Input id={`ac-primeiro-${tenantId}`} type="date" min={hoje} value={primeiro} onChange={(e) => (setPrimeiro(e.target.value), reiniciar())} />
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex flex-wrap justify-between gap-2 border-b bg-muted/40 px-3 py-2">
          <span>
            Em aberto <strong>{formatarMoeda(total)}</strong> − desconto <strong>{formatarMoeda(desconto)}</strong>
          </span>
          <span>
            Acordo: <strong>{formatarMoeda(total - desconto)}</strong>
          </span>
        </div>
        <ul className="divide-y">
          {parcelas.map((p, i) => (
            <li key={i} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 px-3 py-1.5">
              <span className="text-muted-foreground">{i + 1}/{parcelas.length}</span>
              <Input aria-label={`Vencimento da parcela ${i + 1}`} type="date" min={hoje} value={p.vencimento} onChange={(e) => editar(i, { vencimento: e.target.value })} />
              <Input
                aria-label={`Valor da parcela ${i + 1}`}
                inputMode="decimal"
                defaultValue={(p.valorCentavos / 100).toFixed(2).replace(".", ",")}
                key={`${i}-${p.valorCentavos}`}
                onBlur={(e) => editar(i, { valorCentavos: lerMoeda(e.target.value) ?? 0 })}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ac-motivo-${tenantId}`} className="text-xs">Motivo</Label>
        <Input id={`ac-motivo-${tenantId}`} name="motivo" required maxLength={300} placeholder="Ex.: dificuldade de caixa, acordado por telefone em 28/10" />
      </div>
      <input type="hidden" name="acordo" value={JSON.stringify({ faturasIds: selecionadas, descontoCentavos: desconto, parcelas })} />

      {problema && total > 0 && <p className="text-warning">{problema}</p>}
      {estado.erro && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{estado.erro}</p>}
      {estado.sucesso && <p className="rounded-lg bg-success/10 p-3 text-success">{estado.sucesso}</p>}
      <div>
        <Button type="submit" disabled={pendente || Boolean(problema)}>
          <Handshake className="size-4" /> {pendente ? "Criando acordo…" : "Confirmar acordo"}
        </Button>
      </div>
    </form>
  );
}
