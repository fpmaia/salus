import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

// Fusos do Brasil (IANA). A unidade guarda o fuso para converter horários locais.
export const FUSOS_BRASIL = [
  ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, GO, DF, BA, NE)"],
  ["America/Manaus", "Amazonas (AM, RR, RO, MT, MS)"],
  ["America/Belem", "Pará e Amapá"],
  ["America/Fortaleza", "Fortaleza"],
  ["America/Recife", "Recife"],
  ["America/Rio_Branco", "Acre"],
  ["America/Noronha", "Fernando de Noronha"],
] as const;

type Valores = { nome?: string; endereco?: string | null; timezone?: string; slotMinutos?: number };

export function CamposUnidade({ valores = {} }: { valores?: Valores }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={valores.nome} placeholder="Unidade Centro" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" name="endereco" defaultValue={valores.endereco ?? ""} placeholder="Rua, número, cidade" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Fuso horário</Label>
        <NativeSelect id="timezone" name="timezone" defaultValue={valores.timezone ?? "America/Sao_Paulo"}>
          {FUSOS_BRASIL.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slotMinutos">Intervalo da agenda (duração mínima da reserva)</Label>
        <NativeSelect id="slotMinutos" name="slotMinutos" defaultValue={String(valores.slotMinutos ?? 30)}>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="60">1 hora</option>
        </NativeSelect>
      </div>
    </div>
  );
}
