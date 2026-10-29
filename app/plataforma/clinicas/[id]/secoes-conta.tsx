import { NotebookPen, Power, ScrollText, ShieldAlert } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { EventoHistorico, NotaClinica } from "@/src/server/plataforma-clinica";
import { banirAcessoAcao, cancelarContaAcao, criarNotaAcao, encerrarSessoesAcao, reativarContaAcao, suspenderContaAcao, trocarPlanoContaAcao } from "./conta-actions";

function dataHora(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

/** Conta da clínica (aba Resumo): trocar plano com a prévia da próxima fatura, suspender, reativar e cancelar. */
export function SecaoConta({
  tenant,
  precosPorPlano,
  pode,
}: {
  tenant: { id: string; nome: string; status: "ativo" | "suspenso" | "cancelado"; planoId: string; motivoSuspensao: string | null };
  precosPorPlano: { planoId: string; nome: string; valorCentavos: number }[];
  pode: { gerenciar: boolean; financeiro: boolean; cancelar: boolean };
}) {
  if (!pode.gerenciar && !pode.financeiro && !pode.cancelar) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {pode.financeiro && (
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold">Trocar plano</h2>
          <p className="text-xs text-muted-foreground">Próxima fatura estimada em cada plano, com o uso, as condições e os descontos de hoje.</p>
          <FormAcao acao={trocarPlanoContaAcao.bind(null, tenant.id)} textoBotao="Trocar plano" className="flex flex-col gap-2">
            {precosPorPlano.map((p) => (
              <label key={p.planoId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <input type="radio" name="planoId" value={p.planoId} defaultChecked={p.planoId === tenant.planoId} required />
                  {p.nome}
                  {p.planoId === tenant.planoId && <span className="text-muted-foreground">(atual)</span>}
                </span>
                <strong>{formatarMoeda(p.valorCentavos)}/mês</strong>
              </label>
            ))}
          </FormAcao>
        </div>
      )}

      {pode.gerenciar && (
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldAlert className="size-4 text-warning" /> Acesso da clínica
          </h2>
          {tenant.status === "ativo" ? (
            <FormAcao
              acao={suspenderContaAcao.bind(null, tenant.id)}
              textoBotao="Suspender"
              variante="destructive"
              confirmar={`Suspender ${tenant.nome}? Ninguém da clínica entra até reativar; o agendamento online sai do ar.`}
              className="flex flex-col gap-2"
            >
              <Label htmlFor="sus-motivo" className="text-xs">Motivo (a clínica vê)</Label>
              <Input id="sus-motivo" name="motivo" required maxLength={300} placeholder="Ex.: pendência de contrato; fale com o suporte" />
            </FormAcao>
          ) : (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                {tenant.status === "cancelado" ? "Conta cancelada" : "Suspensa"}
                {tenant.motivoSuspensao ? `: ${tenant.motivoSuspensao}` : ""}.
              </p>
              {(tenant.status === "suspenso" || pode.cancelar) && (
                <FormAcao acao={reativarContaAcao.bind(null, tenant.id)} textoBotao={tenant.status === "cancelado" ? "Reabrir conta" : "Reativar"} />
              )}
            </div>
          )}
        </div>
      )}

      {pode.cancelar && tenant.status !== "cancelado" && (
        <div className="space-y-3 rounded-2xl border border-destructive/30 bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
            <Power className="size-4" /> Cancelar conta
          </h2>
          <p className="text-xs text-muted-foreground">Encerra o acesso, cancela as faturas em aberto (no Asaas também) e os acordos. Os dados ficam guardados.</p>
          <FormAcao
            acao={cancelarContaAcao.bind(null, tenant.id)}
            textoBotao="Cancelar conta"
            variante="destructive"
            confirmar={`Cancelar a conta de ${tenant.nome}? Isso cancela as cobranças em aberto.`}
            className="flex flex-col gap-2"
          >
            <Input name="motivo" aria-label="Motivo do cancelamento" required maxLength={300} placeholder="Motivo" />
            <Label htmlFor="cancelar-confirmacao" className="text-xs">
              Digite <strong>{tenant.nome}</strong> para confirmar
            </Label>
            <Input id="cancelar-confirmacao" name="confirmacao" required autoComplete="off" />
          </FormAcao>
        </div>
      )}
    </div>
  );
}

/** Ações de acesso por usuário da clínica (aba Acessos). */
export function AcoesAcesso({ tenantId, usuario, podeBanir }: { tenantId: string; usuario: { id: string; nome: string; banido: boolean }; podeBanir: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <FormAcao
        acao={encerrarSessoesAcao.bind(null, tenantId, usuario.id)}
        textoBotao="Encerrar sessões"
        textoPendente="…"
        variante="outline"
        confirmar={`Desconectar ${usuario.nome} de todos os aparelhos?`}
      />
      {podeBanir &&
        (usuario.banido ? (
          <FormAcao acao={banirAcessoAcao.bind(null, tenantId, usuario.id, false)} textoBotao="Desbloquear" textoPendente="…" variante="outline" />
        ) : (
          <FormAcao
            acao={banirAcessoAcao.bind(null, tenantId, usuario.id, true)}
            textoBotao="Bloquear"
            textoPendente="…"
            variante="outline"
            confirmar={`Bloquear ${usuario.nome} no Salus inteiro? As sessões são encerradas.`}
            className="flex items-center gap-2"
          >
            <Input name="motivo" aria-label={`Motivo do bloqueio de ${usuario.nome}`} maxLength={200} placeholder="Motivo" className="h-8 w-40" />
          </FormAcao>
        ))}
    </span>
  );
}

/** Notas internas da equipe Salus (a clínica não vê). */
export function SecaoNotas({ tenantId, notas }: { tenantId: string; notas: NotaClinica[] }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <NotebookPen className="size-4 text-primary" /> Notas internas
      </h2>
      <FormAcao acao={criarNotaAcao.bind(null, tenantId)} textoBotao="Registrar nota" className="flex flex-col gap-2">
        <textarea
          name="texto"
          aria-label="Nova nota"
          required
          maxLength={2000}
          rows={3}
          placeholder="Ex.: ligou pedindo para mudar o vencimento; combinado dia 20 a partir de dezembro."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </FormAcao>
      {notas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma nota ainda.</p>
      ) : (
        <ul className="space-y-2">
          {notas.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.texto}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.autorNome ?? "—"} · {dataHora(n.criadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Linha do tempo da clínica: ações da equipe Salus e eventos do próprio espaço. */
export function SecaoHistorico({ eventos }: { eventos: EventoHistorico[] }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <ScrollText className="size-4 text-primary" /> Histórico ({eventos.length})
      </h2>
      {eventos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada registrado.</p>
      ) : (
        <ul className="divide-y text-xs">
          {eventos.map((e, i) => (
            <li key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between">
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.origem === "plataforma" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {e.origem === "plataforma" ? "Salus" : "Espaço"}
                  </span>
                  <code className="font-mono">{e.acao}</code>
                </span>
                {e.dados && Object.keys(e.dados).length > 0 && <span className="break-all text-muted-foreground">{JSON.stringify(e.dados)}</span>}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {e.pessoa ?? "Sistema"} · {dataHora(e.criadoEm)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
