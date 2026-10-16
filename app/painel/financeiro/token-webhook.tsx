"use client";

import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import type { EstadoAcao } from "@/src/server/acao";

/** Gera o token do webhook e mostra URL + token uma única vez para copiar no painel do Asaas. */
export function BotaoTokenWebhook({
  acao,
  configurado,
}: {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  configurado: boolean;
}) {
  return (
    <FormAcao
      acao={acao}
      textoBotao={configurado ? "Gerar novo token do webhook" : "Gerar token do webhook"}
      textoPendente="Gerando…"
      variante="outline"
      confirmar={configurado ? "O token atual deixará de funcionar. Continuar?" : undefined}
      depois={(estado) =>
        estado.dados ? (
          <div className="grid w-full gap-2 sm:grid-cols-2">
            <Input readOnly value={estado.dados.url} onFocus={(e) => e.currentTarget.select()} aria-label="URL do webhook" />
            <Input readOnly value={estado.dados.token} onFocus={(e) => e.currentTarget.select()} aria-label="Token de autenticação" />
          </div>
        ) : null
      }
    />
  );
}
