"use client";

import { useState, useTransition } from "react";
import { XCircle, Loader2 } from "lucide-react";
import { encerrarContratoAcao } from "../actions";

interface BotaoEncerrarContratoProps {
  contratoId: string;
  codigo: string;
}

export function BotaoEncerrarContrato({ contratoId, codigo }: BotaoEncerrarContratoProps) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const handleEncerrar = () => {
    const confirmou = window.confirm(
      `Deseja realmente encerrar o contrato ${codigo}?\n\nAs regras de recorrência serão desativadas e as reservas futuras de salas sem pacientes serão canceladas automaticamente.`
    );
    if (!confirmou) return;

    setErro(null);
    startTransition(async () => {
      const res = await encerrarContratoAcao(contratoId);
      if (res.erro) {
        setErro(res.erro);
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleEncerrar}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-semibold text-destructive shadow-xs hover:bg-destructive/20 transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Encerrando...</span>
          </>
        ) : (
          <>
            <XCircle className="size-4" />
            <span>Encerrar Contrato</span>
          </>
        )}
      </button>

      {erro && (
        <p className="text-[11px] font-semibold text-destructive mt-1">
          {erro}
        </p>
      )}
    </div>
  );
}
