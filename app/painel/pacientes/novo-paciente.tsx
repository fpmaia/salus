"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { criarPacienteAcao } from "./actions";
import { CamposPaciente } from "./campos-paciente";

/** Cadastro em painel lateral: a lista continua à vista (e ?novo=1 já abre o painel). */
export function NovoPaciente({ abertoInicial = false }: { abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Novo paciente
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Novo paciente</SheetTitle>
          <SheetDescription>Peça apenas os dados necessários. O CPF é opcional.</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <FormAcao acao={criarPacienteAcao} textoBotao="Cadastrar paciente" aoConcluir={() => setAberto(false)}>
            <CamposPaciente prefixo="novo" />
          </FormAcao>
        </div>
      </SheetContent>
    </Sheet>
  );
}
