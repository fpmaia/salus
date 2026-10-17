import type { pacientes } from "@/src/db/schema";
import type { RegistroLido } from "@/src/server/prontuario";
import { horarioLocal } from "@/src/server/prontuario";
import { formatarDataBr } from "@/src/server/reservas";
import { BotaoImprimir } from "./botao-imprimir";
import { RegistrosParaImpressao } from "./registros";

/** Documento para impressão/PDF do prontuário (profissional ou solicitação formal). */
export function DocumentoProntuario({
  paciente,
  registros,
  tenantNome,
  emitidoPor,
  solicitacao,
}: {
  paciente: typeof pacientes.$inferSelect;
  registros: RegistroLido[];
  tenantNome: string;
  emitidoPor: string;
  solicitacao: { justificativa: string; profissionalNome: string } | null;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{tenantNome}</p>
          <h1 className="text-xl font-semibold">Prontuário — {paciente.nome}</h1>
          <p className="text-xs text-muted-foreground">
            {paciente.dataNascimento && `Nascimento: ${formatarDataBr(paciente.dataNascimento)} · `}
            Emitido em {horarioLocal(new Date())} por {emitidoPor}
          </p>
          {solicitacao && (
            <p className="mt-2 text-xs">
              Cópia por solicitação formal dos registros de {solicitacao.profissionalNome}. Justificativa: {solicitacao.justificativa}
            </p>
          )}
        </div>
        <BotaoImprimir />
      </div>
      <RegistrosParaImpressao registros={registros} />
      <p className="text-[10px] text-muted-foreground">
        Documento sigiloso. Registros com assinatura eletrônica simples (autoria, data/hora e hash SHA-256 de integridade); não
        substitui assinatura digital ICP-Brasil.
      </p>
    </main>
  );
}
