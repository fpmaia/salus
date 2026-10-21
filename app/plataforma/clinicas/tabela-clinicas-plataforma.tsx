"use client";

import { useActionState, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit2,
  Lock,
  PauseCircle,
  PlayCircle,
  Search,
  Shield,
  Users,
} from "lucide-react";
import type { ClinicaPlataforma } from "@/src/server/plataforma";
import {
  alterarPlanoPlataformaAcao,
  reativarClinicaPlataformaAcao,
  suspenderClinicaPlataformaAcao,
} from "../actions";

interface Props {
  clinicas: ClinicaPlataforma[];
  planos: Array<{ id: string; codigo: string; nome: string; precoMensalCentavos: number }>;
}

export function TabelaClinicasPlataforma({ clinicas, planos }: Props) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativo" | "suspenso">("todos");
  const [clinicaParaSuspender, setClinicaParaSuspender] = useState<ClinicaPlataforma | null>(null);
  const [clinicaParaTrocarPlano, setClinicaParaTrocarPlano] = useState<ClinicaPlataforma | null>(null);

  const [estadoSuspender, acaoSuspender, pendenteSuspender] = useActionState(suspenderClinicaPlataformaAcao, null);
  const [estadoReativar, acaoReativar, pendenteReativar] = useActionState(reativarClinicaPlataformaAcao, null);
  const [estadoPlano, acaoPlano, pendentePlano] = useActionState(alterarPlanoPlataformaAcao, null);

  const clinicasFiltradas = clinicas.filter((c) => {
    const atendeStatus = filtroStatus === "todos" || c.status === filtroStatus;
    const termo = busca.toLowerCase();
    const atendeBusca =
      !termo ||
      c.nome.toLowerCase().includes(termo) ||
      c.documento.includes(termo) ||
      c.planoNome.toLowerCase().includes(termo);
    return atendeStatus && atendeBusca;
  });

  const formatarMoeda = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* Topo e Filtros */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Clínicas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visualize e controle todos os espaços de atendimento cadastrados no Salus.
          </p>
        </div>
      </div>

      {/* Alertas */}
      {estadoSuspender?.sucesso && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-400">
          {estadoSuspender.sucesso}
        </div>
      )}
      {estadoReativar?.sucesso && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-400">
          {estadoReativar.sucesso}
        </div>
      )}
      {estadoPlano?.sucesso && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-xs text-primary">
          {estadoPlano.sucesso}
        </div>
      )}

      {/* Barra de Busca e Filtro de Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome da clínica, CNPJ ou plano..."
            className="w-full rounded-xl border border-input bg-card pl-10 pr-4 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {(["todos", "ativo", "suspenso"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filtroStatus === st
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {st === "todos" ? "Todas" : st === "ativo" ? "Ativas" : "Suspensas"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Clínicas */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="divide-y divide-border/40">
          {clinicasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma clínica encontrada com os critérios informados.
            </div>
          ) : (
            clinicasFiltradas.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-base text-foreground">{c.nome}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        c.status === "ativo"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-destructive/10 text-destructive border border-destructive/20"
                      }`}
                    >
                      {c.status === "ativo" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                      {c.status === "ativo" ? "Ativa" : "Suspensa"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Documento: <strong>{c.documento}</strong></span>
                    <span>•</span>
                    <span>Plano: <strong className="text-foreground">{c.planoNome}</strong> ({formatarMoeda(c.planoPrecoCentavos)}/mês)</span>
                    <span>•</span>
                    <span>{c.membrosCount} membros</span>
                    <span>•</span>
                    <span>{c.salasCount} salas</span>
                    <span>•</span>
                    <span>{c.profissionaisCount} profissionais</span>
                  </div>
                </div>

                {/* Ações Administrativas */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => setClinicaParaTrocarPlano(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    <Edit2 className="size-3" /> Mudar Plano
                  </button>

                  {c.status === "ativo" ? (
                    <button
                      onClick={() => setClinicaParaSuspender(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 px-3 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <PauseCircle className="size-3.5" /> Suspender
                    </button>
                  ) : (
                    <form action={acaoReativar}>
                      <input type="hidden" name="tenantId" value={c.id} />
                      <button
                        type="submit"
                        disabled={pendenteReativar}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        <PlayCircle className="size-3.5" /> Reativar
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Suspender Clínica */}
      {clinicaParaSuspender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Suspender Clínica
            </h3>
            <p className="text-xs text-muted-foreground">
              A suspensão bloqueará o login e novos agendamentos na clínica <strong>{clinicaParaSuspender.nome}</strong>.
            </p>

            <form
              action={async (formData) => {
                await acaoSuspender(formData);
                setClinicaParaSuspender(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="tenantId" value={clinicaParaSuspender.id} />
              <div>
                <label className="text-xs font-semibold text-foreground">Motivo da Suspensão</label>
                <input
                  type="text"
                  name="motivo"
                  required
                  placeholder="Ex.: Inadimplência na fatura SaaS / Solicitação do cliente"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-destructive/40"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClinicaParaSuspender(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendenteSuspender}
                  className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
                >
                  {pendenteSuspender ? "Suspendendo..." : "Confirmar Suspensão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Trocar Plano */}
      {clinicaParaTrocarPlano && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Alterar Plano SaaS</h3>
            <p className="text-xs text-muted-foreground">
              Selecione o novo plano da clínica <strong>{clinicaParaTrocarPlano.nome}</strong>.
            </p>

            <form
              action={async (formData) => {
                await acaoPlano(formData);
                setClinicaParaTrocarPlano(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="tenantId" value={clinicaParaTrocarPlano.id} />

              <div className="space-y-2">
                {planos.map((plano) => (
                  <label
                    key={plano.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/30 cursor-pointer"
                  >
                    <div>
                      <span className="text-sm font-bold text-foreground block">{plano.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatarMoeda(plano.precoMensalCentavos)}/mês
                      </span>
                    </div>
                    <input
                      type="radio"
                      name="planoId"
                      value={plano.id}
                      defaultChecked={clinicaParaTrocarPlano.planoCodigo === plano.codigo}
                      className="text-primary"
                    />
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClinicaParaTrocarPlano(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendentePlano}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {pendentePlano ? "Alterando..." : "Salvar Novo Plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
