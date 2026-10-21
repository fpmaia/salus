"use client";

import { InputMascara } from "@/components/input-mascara";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarEspaco, type EstadoOnboarding } from "./actions";

const estadoInicial: EstadoOnboarding = {
  erro: null,
  valores: { nomeTenant: "", documento: "" },
};

export function FormularioOnboarding() {
  const [estado, acao, pendente] = useActionState(criarEspaco, estadoInicial);

  return (
    // defaultValue com os valores devolvidos: o React reseta o form após a action.
    <form action={acao}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nomeTenant">Nome do espaço</Label>
          <Input
            id="nomeTenant"
            name="nomeTenant"
            placeholder="Coworking Saúde Centro"
            defaultValue={estado.valores.nomeTenant}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="documento">CNPJ ou CPF</Label>
          <InputMascara
            mascara="cpfCnpj"
            id="documento"
            name="documento"
            placeholder="00.000.000/0000-00"
            defaultValue={estado.valores.documento}
            required
          />
        </div>
        {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
      </CardContent>
      <CardFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={pendente}>
          {pendente ? "Criando…" : "Criar espaço"}
        </Button>
      </CardFooter>
    </form>
  );
}
