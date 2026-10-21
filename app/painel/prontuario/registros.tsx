import type { RegistroLido } from "@/src/server/prontuario";
import { horarioLocal } from "@/src/server/prontuario";

function tamanho(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function SeloIntegridade({ registro }: { registro: RegistroLido }) {
  if (registro.status === "rascunho") return <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Rascunho</span>;
  return registro.integro ? (
    <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs text-success" title={`SHA-256 ${registro.hash}`}>
      Finalizado · íntegro
    </span>
  ) : (
    <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-xs text-destructive">Finalizado · integridade NÃO confere</span>
  );
}

/** Conteúdo de um registro (usado na tela, na impressão e na solicitação). */
export function ConteudoRegistro({ registro, comLinks = true }: { registro: RegistroLido; comLinks?: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {registro.tipo === "adendo" ? "Adendo" : "Evolução"} · {registro.autorNome}
          <span className="block text-xs font-normal text-muted-foreground">
            {registro.finalizadoEm ? `Finalizado em ${horarioLocal(registro.finalizadoEm)}` : `Criado em ${horarioLocal(registro.criadoEm)}`}
          </span>
        </span>
        <SeloIntegridade registro={registro} />
      </div>
      {registro.conteudo.anotacoes && <p className="whitespace-pre-wrap">{registro.conteudo.anotacoes}</p>}
      {registro.conteudo.prescricao && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Prescrição / orientações</p>
          <p className="whitespace-pre-wrap">{registro.conteudo.prescricao}</p>
        </div>
      )}
      {registro.anexos.length > 0 && (
        <ul className="flex flex-wrap gap-3 text-xs">
          {registro.anexos.map((a) =>
            comLinks ? (
              <li key={a.id}>
                <a href={`/api/prontuario/anexos/${a.id}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  📎 {a.nome}
                </a>{" "}
                <span className="text-muted-foreground">({tamanho(a.tamanho)})</span>
              </li>
            ) : (
              <li key={a.id}>
                Anexo: {a.nome} ({tamanho(a.tamanho)})
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** Lista para impressão: evoluções finalizadas com os adendos logo abaixo. */
export function RegistrosParaImpressao({ registros }: { registros: RegistroLido[] }) {
  const evolucoes = registros.filter((r) => r.tipo === "evolucao");
  if (registros.length === 0) return <p className="text-sm">Nenhum registro finalizado.</p>;
  return (
    <div className="flex flex-col gap-4">
      {evolucoes.map((e) => (
        <section key={e.id} className="break-inside-avoid border-b pb-4">
          <ConteudoRegistro registro={e} comLinks={false} />
          {registros
            .filter((a) => a.adendoDe === e.id)
            .map((a) => (
              <div key={a.id} className="mt-3 border-l-2 pl-3">
                <ConteudoRegistro registro={a} comLinks={false} />
              </div>
            ))}
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">SHA-256 {e.hash}</p>
        </section>
      ))}
    </div>
  );
}
