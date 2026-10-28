"use client";

import { useState } from "react";
import { CheckSquare, ClipboardCheck, FileText, School, Send, Sparkles, Stethoscope } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { MODELOS_DOCUMENTOS, modeloDocumento } from "@/src/domain/modelos-documentos";
import { LIMITE_TITULO } from "@/src/domain/prontuario";
import { horarioLocal } from "@/src/domain/tempo";

const textarea =
  "min-h-36 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-sans leading-relaxed";

const ICONES: Record<string, typeof FileText> = {
  em_branco: FileText,
  relatorio_clinico: Stethoscope,
  laudo: ClipboardCheck,
  atestado_comparecimento: CheckSquare,
  declaracao: CheckSquare,
  encaminhamento: Send,
  cfp_relatorio: Sparkles,
  escolar: School,
};

type Atendimento = { id: string; status: string; inicio: Date };
type RegistroEdicao = {
  id?: string;
  agendamentoId?: string | null;
  conteudo: { titulo?: string; anotacoes: string; prescricao: string };
};

/**
 * Editor de rascunho. Evolução: anotação da sessão, sem modelos. Documento: título obrigatório
 * e modelos prontos (relatório, laudo, declaração, atestado, encaminhamento).
 */
export function EditorRegistroComModelos({
  acao,
  atendimentos,
  registro,
  tipo = "evolucao",
}: {
  acao: Parameters<typeof FormAcao>[0]["acao"];
  atendimentos: Atendimento[];
  registro?: RegistroEdicao;
  tipo?: "evolucao" | "documento";
}) {
  const documento = tipo === "documento";
  const sufixo = `${tipo}-${registro?.id ?? "novo"}`;
  const [titulo, setTitulo] = useState(registro?.conteudo.titulo ?? "");
  const [anotacoes, setAnotacoes] = useState(registro?.conteudo.anotacoes ?? "");
  const [prescricao, setPrescricao] = useState(registro?.conteudo.prescricao ?? "");
  const [modeloSelecionado, setModeloSelecionado] = useState<string | null>(null);

  const aplicarModelo = (modeloId: string) => {
    const mod = modeloDocumento(modeloId);
    if (!mod) return;
    if ((anotacoes.trim() || prescricao.trim()) && !window.confirm("Substituir o conteúdo atual pelo modelo selecionado?")) return;
    setTitulo(mod.titulo);
    setAnotacoes(mod.anotacoes);
    setPrescricao(mod.prescricao);
    setModeloSelecionado(modeloId);
  };

  return (
    <FormAcao key={registro?.id ?? "novo"} acao={acao} textoBotao={registro ? "Salvar rascunho" : "Criar rascunho"} className="flex flex-col gap-5">
      <input type="hidden" name="tipo" value={tipo} />

      {documento && !registro && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5 text-primary" /> Comece por um modelo
            </span>
            <span className="text-[11px] text-muted-foreground">Você edita tudo antes de finalizar</span>
          </div>
          <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            {MODELOS_DOCUMENTOS.map((m) => {
              const Icone = ICONES[m.id] ?? FileText;
              const ativo = modeloSelecionado === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => aplicarModelo(m.id)}
                  className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                    ativo ? "border-primary bg-primary/15 shadow-2xs ring-1 ring-primary" : "border-border/70 bg-background hover:bg-muted/50"
                  }`}
                >
                  <Icone className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold leading-tight text-foreground">{m.nome}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                      {m.area === "psicologia" ? "Psicologia · " : ""}
                      {m.descricao}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {documento && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`ti-${sufixo}`}>Título do documento</Label>
          <Input
            id={`ti-${sufixo}`}
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={LIMITE_TITULO}
            required
            placeholder="Ex.: Relatório clínico, Laudo, Declaração de acompanhamento"
          />
        </div>
      )}

      {atendimentos.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`at-${sufixo}`}>Atendimento vinculado</Label>
          <NativeSelect
            id={`at-${sufixo}`}
            name="agendamentoId"
            defaultValue={registro ? (registro.agendamentoId ?? "") : documento ? "" : (atendimentos[0]?.id ?? "")}
          >
            <option value="">Sem vínculo com atendimento específico</option>
            {atendimentos.map((a) => (
              <option key={a.id} value={a.id}>
                {horarioLocal(a.inicio)} · {a.status}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`an-${sufixo}`}>{documento ? "Texto do documento" : "Evolução"}</Label>
          <span className="text-[11px] text-muted-foreground">Sigilo profissional resguardado</span>
        </div>
        <textarea
          id={`an-${sufixo}`}
          name="anotacoes"
          className={textarea}
          value={anotacoes}
          onChange={(e) => setAnotacoes(e.target.value)}
          placeholder={documento ? "Escolha um modelo acima ou escreva o documento…" : "Descreva a sessão ou consulta…"}
          rows={documento ? 14 : 8}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`pr-${sufixo}`}>
          {documento ? "Orientações ou recomendações (opcional)" : "Orientações, recomendações ou prescrição (opcional)"}
        </Label>
        <textarea
          id={`pr-${sufixo}`}
          name="prescricao"
          className={textarea}
          value={prescricao}
          onChange={(e) => setPrescricao(e.target.value)}
          placeholder="Orientações ao paciente, à família ou à escola, encaminhamentos…"
          rows={3}
        />
      </div>
    </FormAcao>
  );
}
