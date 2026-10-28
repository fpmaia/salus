import { Activity } from "lucide-react";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarAuditoriaPlataforma } from "@/src/server/plataforma";

export default async function PlataformaAuditoriaPage() {
  const usuario = await exigirUsuario();
  const eventos = await listarAuditoriaPlataforma(usuario.id, 100);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="size-6 text-primary" />
          Auditoria Global da Plataforma
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Histórico imutável de todas as ações administrativas realizadas na plataforma Salus.
        </p>
      </div>

      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="divide-y divide-border/40">
          {eventos.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento registrado até o momento.
            </div>
          ) : (
            eventos.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                      {ev.acao}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      em <strong className="text-foreground">{ev.alvoTipo}</strong> ({ev.alvoId || "global"})
                    </span>
                  </div>
                  {ev.dados && (
                    <pre className="text-[11px] text-muted-foreground font-mono bg-muted/30 p-2 rounded-lg max-w-2xl overflow-x-auto">
                      {JSON.stringify(ev.dados, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="text-right text-xs text-muted-foreground self-end sm:self-center">
                  <span className="font-medium text-foreground block">
                    {ev.userNome || ev.userEmail || "Sistema"}
                  </span>
                  <span>
                    {new Date(ev.criadoEm).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
