import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * O que fazer com as reservas já marcadas (feriado, sala ou profissional desativado).
 * "Perguntar" (padrão) não grava nada se houver reservas: a lista volta na mensagem.
 */
export function DecisaoReservas({ id, rotulo = "Se já houver reservas marcadas" }: { id: string; rotulo?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <NativeSelect id={id} name="decisaoReservas" defaultValue="">
        <option value="">Mostrar a lista antes de decidir</option>
        <option value="manter">Manter as reservas</option>
        <option value="cancelar">Cancelar e avisar por WhatsApp (sem cobrança)</option>
      </NativeSelect>
    </div>
  );
}
