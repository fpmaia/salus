"use client";

import { Input } from "@/components/ui/input";
import { MASCARAS, normalizarMoeda, type TipoMascara } from "@/src/domain/mascaras";

type Props = React.ComponentProps<typeof Input> & { mascara: TipoMascara };

/**
 * Campo com máscara (não controlado): CPF, telefone e CEP formatam ao digitar; valor em R$
 * é normalizado ao sair do campo, para não atrapalhar a digitação.
 */
export function InputMascara({ mascara, onChange, onBlur, defaultValue, ...props }: Props) {
  const formatar = mascara === "moeda" ? (v: string) => v : MASCARAS[mascara];
  return (
    <Input
      {...props}
      inputMode={mascara === "moeda" ? "decimal" : mascara === "telefone" ? "tel" : "numeric"}
      defaultValue={typeof defaultValue === "string" && defaultValue ? formatar(defaultValue) : defaultValue}
      onChange={(e) => {
        if (mascara !== "moeda") e.currentTarget.value = formatar(e.currentTarget.value);
        onChange?.(e);
      }}
      onBlur={(e) => {
        if (mascara === "moeda" && e.currentTarget.value) e.currentTarget.value = normalizarMoeda(e.currentTarget.value);
        onBlur?.(e);
      }}
    />
  );
}
