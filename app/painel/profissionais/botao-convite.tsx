"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAcao } from "@/src/server/acao";

type Props = {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  pendente: boolean;
};

/** Gera o link de convite e permite copiá-lo para enviar por WhatsApp. */
export function BotaoConvite({ acao, pendente }: Props) {
  return (
    <FormAcao
      acao={acao}
      textoBotao={pendente ? "Gerar novo link" : "Gerar convite"}
      textoPendente="Gerando…"
      variante="outline"
      confirmar={pendente ? "O link anterior deixará de funcionar. Continuar?" : undefined}
      depois={(estado) => (estado.dados?.link ? <LinkCopiavel link={estado.dados.link} /> : null)}
    />
  );
}

function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex w-full gap-2">
      <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopiado(true);
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
