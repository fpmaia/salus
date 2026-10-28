"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EstadoAcao } from "@/src/server/acao";
import { criarConviteClinicaAcao } from "./actions";

const ESTADO_INICIAL: EstadoAcao = { erro: null, sucesso: null };

type Plano = { id: string; nome: string; codigo: string };

/** Formulário do convite trial; depois de criar, mostra o link uma única vez para copiar. */
export function FormularioConviteClinica({ planos, validadePadrao }: { planos: Plano[]; validadePadrao: number }) {
  const [estado, acao, pendente] = useActionState(criarConviteClinicaAcao, ESTADO_INICIAL);
  const [copiado, setCopiado] = useState(false);
  const link = estado.dados?.link ? `${window.location.origin}${estado.dados.link}` : null;

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="cv-email">E-mail de quem vai administrar a clínica</Label>
          <Input id="cv-email" name="email" type="email" required placeholder="dona@clinica.com.br" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-plano">Plano do teste</Label>
          <NativeSelect id="cv-plano" name="planoId" required defaultValue={planos.find((p) => p.codigo === "pro")?.id ?? planos[0]?.id}>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-dias">Dias de teste grátis</Label>
          <Input id="cv-dias" name="diasTeste" type="number" min={1} max={365} defaultValue={30} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-validade">Link vale por (dias)</Label>
          <Input id="cv-validade" name="validadeDias" type="number" min={1} max={90} defaultValue={validadePadrao} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cv-obs">Observação interna (opcional)</Label>
          <Input id="cv-obs" name="observacao" maxLength={300} placeholder="Ex.: indicação, evento, parceiro" />
        </div>
      </div>

      {estado.erro && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{estado.erro}</p>}
      {estado.sucesso && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <p className="font-semibold">{estado.sucesso}</p>
          {link && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded-md border border-success/30 bg-background/80 px-2 py-1 text-xs text-foreground">{link}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                }}
                className="inline-flex items-center gap-1 rounded bg-success px-2 py-1 text-xs font-medium text-white"
              >
                {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copiado ? "Copiado!" : "Copiar link"}
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <Button type="submit" disabled={pendente}>
          <Send className="size-4" /> {pendente ? "Gerando convite…" : "Gerar convite e enviar e-mail"}
        </Button>
      </div>
    </form>
  );
}
