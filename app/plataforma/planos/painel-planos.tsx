"use client";

import { useActionState, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  X,
  Stethoscope,
  Building2,
  DoorOpen,
  Users,
} from "lucide-react";
import { atualizarPlanoPlataformaAcao } from "./actions";

type Plano = {
  id: string;
  codigo: string;
  nome: string;
  precoMensalCentavos: number;
  limites: Record<string, number>;
  precoSalaExtraCentavos: number;
  precoProfissionalExtraCentavos: number;
  precoUnidadeExtraCentavos: number;
  precoProntuarioCentavos: number;
  permiteUnidadeExtra: boolean;
  ativo: boolean;
};

export function PainelPlanos({ planos, podeEditar }: { planos: Plano[]; podeEditar: boolean }) {
  const [planoEmEdicao, setPlanoEmEdicao] = useState<Plano | null>(null);
  const [estado, acao, pendente] = useActionState(atualizarPlanoPlataformaAcao, null);

  const formatarMoeda = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* Mensagens de feedback */}
      {estado?.sucesso && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success animate-in fade-in">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>{estado.sucesso}</span>
        </div>
      )}
      {estado?.erro && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive animate-in fade-in">
          <AlertTriangle className="size-5 shrink-0" />
          <span>{estado.erro}</span>
        </div>
      )}

      {/* Grid de Planos */}
      <div className="grid gap-6 md:grid-cols-3">
        {planos.map((p) => (
          <div
            key={p.id}
            className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-primary/40 transition-all"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{p.nome}</h3>
                  <span className="text-xs font-mono uppercase text-muted-foreground">{p.codigo}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3" /> Ativo
                </span>
              </div>

              <div>
                <span className="text-3xl font-extrabold tracking-tight text-foreground">
                  {formatarMoeda(p.precoMensalCentavos)}
                </span>
                <span className="text-sm text-muted-foreground"> / mês base</span>
              </div>

              {/* Limites Inclusos */}
              <div className="rounded-xl bg-muted/40 p-3.5 space-y-2 border text-xs">
                <span className="font-semibold text-foreground block">Recursos inclusos no plano:</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-background p-2 border">
                    <Building2 className="size-3.5 mx-auto mb-1 text-primary" />
                    <span className="block font-bold text-sm text-foreground">
                      {p.limites.unidades ?? "∞"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">unidades</span>
                  </div>
                  <div className="rounded-lg bg-background p-2 border">
                    <DoorOpen className="size-3.5 mx-auto mb-1 text-primary" />
                    <span className="block font-bold text-sm text-foreground">
                      {p.limites.salas ?? "∞"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">salas</span>
                  </div>
                  <div className="rounded-lg bg-background p-2 border">
                    <Users className="size-3.5 mx-auto mb-1 text-primary" />
                    <span className="block font-bold text-sm text-foreground">
                      {p.limites.profissionais ?? "∞"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">profissionais</span>
                  </div>
                </div>
              </div>

              {/* Valores de Overages e Add-on */}
              <div className="space-y-1.5 text-xs text-muted-foreground pt-1">
                <div className="flex justify-between items-center py-1 border-b">
                  <span>Sala adicional:</span>
                  <strong className="text-foreground">{formatarMoeda(p.precoSalaExtraCentavos)}/mês</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <span>Profissional adicional:</span>
                  <strong className="text-foreground">{formatarMoeda(p.precoProfissionalExtraCentavos)}/mês</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <span>Unidade adicional:</span>
                  <strong className="text-foreground">
                    {p.permiteUnidadeExtra ? `${formatarMoeda(p.precoUnidadeExtraCentavos)}/mês` : "Requer upgrade"}
                  </strong>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="flex items-center gap-1 text-primary font-medium">
                    <Stethoscope className="size-3" /> Prontuário EHR:
                  </span>
                  <strong className="text-foreground">{formatarMoeda(p.precoProntuarioCentavos)}/mês/prof</strong>
                </div>
              </div>
            </div>

            {podeEditar && <div className="pt-6">
              <button
                type="button"
                onClick={() => setPlanoEmEdicao(p)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-foreground/30 transition-all shadow-sm"
              >
                <Edit3 className="size-3.5 text-primary" /> Configurar Preços e Limites
              </button>
            </div>}
          </div>
        ))}
      </div>

      {/* Modal de Edição */}
      {planoEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Editar Plano: {planoEmEdicao.nome}
                </h3>
                <span className="text-xs text-muted-foreground">
                  Ajuste o valor mensal base, limites inclusos e preços dos excedentes
                </span>
              </div>
              <button
                onClick={() => setPlanoEmEdicao(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form action={acao} onSubmit={() => setTimeout(() => setPlanoEmEdicao(null), 500)} className="space-y-4">
              <input type="hidden" name="planoId" value={planoEmEdicao.id} />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Nome de Exibição</label>
                  <input
                    type="text"
                    name="nome"
                    defaultValue={planoEmEdicao.nome}
                    required
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Preço Base Mensal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="precoMensal"
                    defaultValue={(planoEmEdicao.precoMensalCentavos / 100).toFixed(2)}
                    required
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              {/* Limites Inclusos */}
              <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
                <span className="text-xs font-bold text-foreground block">Limites Inclusos</span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Unidades</label>
                    <input
                      type="number"
                      name="limiteUnidades"
                      defaultValue={planoEmEdicao.limites.unidades ?? 1}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Salas</label>
                    <input
                      type="number"
                      name="limiteSalas"
                      defaultValue={planoEmEdicao.limites.salas ?? 3}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Profissionais</label>
                    <input
                      type="number"
                      name="limiteProfissionais"
                      defaultValue={planoEmEdicao.limites.profissionais ?? 5}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Preços de Overages e Add-on */}
              <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
                <span className="text-xs font-bold text-foreground block">Preço de Adicionais / Overages (R$)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Sala Extra (R$/mês)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="precoSalaExtra"
                      defaultValue={(planoEmEdicao.precoSalaExtraCentavos / 100).toFixed(2)}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Profissional Extra (R$/mês)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="precoProfissionalExtra"
                      defaultValue={(planoEmEdicao.precoProfissionalExtraCentavos / 100).toFixed(2)}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Unidade Extra (R$/mês)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="precoUnidadeExtra"
                      defaultValue={(planoEmEdicao.precoUnidadeExtraCentavos / 100).toFixed(2)}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Prontuário EHR (R$/mês/prof)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="precoProntuario"
                      defaultValue={(planoEmEdicao.precoProntuarioCentavos / 100).toFixed(2)}
                      required
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="permiteUnidadeExtra"
                    name="permiteUnidadeExtra"
                    value="true"
                    defaultChecked={planoEmEdicao.permiteUnidadeExtra}
                    className="size-4 rounded border-border"
                  />
                  <label htmlFor="permiteUnidadeExtra" className="text-xs text-foreground cursor-pointer">
                    Permitir unidades extras além do limite (se desmarcado, 2ª unidade exige upgrade de plano)
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanoEmEdicao(null)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendente}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {pendente ? "Salvando…" : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
