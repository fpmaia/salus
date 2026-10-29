import { Activity, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarAuditoriaPlataforma } from "@/src/server/plataforma";
import { acessoPlataforma } from "../acesso";
import { filtrosDaAuditoria } from "./filtros";

export default async function PlataformaAuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario } = await acessoPlataforma();
  const filtros = filtrosDaAuditoria(await searchParams);
  const eventos = await listarAuditoriaPlataforma(usuario.id, 200, undefined, filtros);
  const consulta = new URLSearchParams(Object.entries(filtros).filter((e): e is [string, string] => Boolean(e[1]))).toString();

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

      <form className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-acao" className="text-xs">Ação começa com</Label>
          <Input id="f-acao" name="acao" defaultValue={filtros.acao} placeholder="plataforma.fatura" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-alvo" className="text-xs">Id do alvo</Label>
          <Input id="f-alvo" name="alvoId" defaultValue={filtros.alvoId} placeholder="id da clínica, fatura…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-pessoa" className="text-xs">Quem fez</Label>
          <Input id="f-pessoa" name="pessoa" defaultValue={filtros.pessoa} placeholder="nome ou e-mail" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-de" className="text-xs">De</Label>
          <Input id="f-de" name="de" type="date" defaultValue={filtros.de} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-ate" className="text-xs">Até</Label>
          <Input id="f-ate" name="ate" type="date" defaultValue={filtros.ate} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/plataforma/auditoria/csv${consulta ? `?${consulta}` : ""}`}>
              <Download className="size-3.5" /> CSV
            </a>
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="divide-y divide-border/40">
          {eventos.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento encontrado.
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
