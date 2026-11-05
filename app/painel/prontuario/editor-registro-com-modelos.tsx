"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Building2, CheckSquare, ClipboardCheck, FileText, School, Send, Sparkles, Stethoscope, UserRound } from "lucide-react";
import { useAviso } from "@/components/avisos";
import { useConfirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { MODELOS_DOCUMENTOS, modeloDocumento } from "@/src/domain/modelos-documentos";
import { LIMITE_TITULO } from "@/src/domain/prontuario";
import { horarioLocal } from "@/src/domain/tempo";
import type { Modelo } from "@/src/server/documentos-personalizados";
import { salvarComoModeloAcao } from "../documentos/actions";

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
  modelosPersonalizados,
}: {
  acao: Parameters<typeof FormAcao>[0]["acao"];
  atendimentos: Atendimento[];
  registro?: RegistroEdicao;
  tipo?: "evolucao" | "documento";
  /** Modelos do espaço: os da clínica e os do profissional (além dos do sistema). */
  modelosPersonalizados?: { clinica: Modelo[]; meus: Modelo[] };
}) {
  const documento = tipo === "documento";
  const sufixo = `${tipo}-${registro?.id ?? "novo"}`;
  const [titulo, setTitulo] = useState(registro?.conteudo.titulo ?? "");
  const [anotacoes, setAnotacoes] = useState(registro?.conteudo.anotacoes ?? "");
  const [prescricao, setPrescricao] = useState(registro?.conteudo.prescricao ?? "");
  const [modeloSelecionado, setModeloSelecionado] = useState<string | null>(null);

  const [confirmar, dialogoConfirmacao] = useConfirmar();

  const aplicarModelo = async (chave: string, mod: { titulo: string; anotacoes: string; prescricao: string } | undefined) => {
    if (!mod) return;
    if (
      (anotacoes.trim() || prescricao.trim()) &&
      !(await confirmar({ titulo: "Substituir o texto?", descricao: "O conteúdo atual será trocado pelo do modelo selecionado.", confirmar: "Substituir" }))
    ) {
      return;
    }
    setTitulo(mod.titulo);
    setAnotacoes(mod.anotacoes);
    setPrescricao(mod.prescricao);
    setModeloSelecionado(chave);
  };

  const gruposPersonalizados = [
    { rotulo: "Meus modelos", Icone: UserRound, modelos: modelosPersonalizados?.meus ?? [] },
    { rotulo: "Modelos da clínica", Icone: Building2, modelos: modelosPersonalizados?.clinica ?? [] },
  ].filter((g) => g.modelos.length > 0);

  return (
    <FormAcao key={registro?.id ?? "novo"} acao={acao} textoBotao={registro ? "Salvar rascunho" : "Criar rascunho"} className="flex flex-col gap-5">
      <input type="hidden" name="tipo" value={tipo} />
      {dialogoConfirmacao}

      {documento && !registro && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5 text-primary" /> Comece por um modelo
            </span>
            <span className="text-[11px] text-muted-foreground">Você edita tudo antes de finalizar</span>
          </div>
          {gruposPersonalizados.map(({ rotulo, Icone, modelos }) => (
            <div key={rotulo} className="flex flex-col gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground">{rotulo}</span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {modelos.map((m) => {
                  const ativo = modeloSelecionado === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => aplicarModelo(m.id, m)}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                        ativo ? "border-primary bg-primary/15 shadow-2xs ring-1 ring-primary" : "border-border/70 bg-background hover:bg-muted/50"
                      }`}
                    >
                      <Icone className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-tight text-foreground">{m.nome}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{m.descricao || m.titulo}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {gruposPersonalizados.length > 0 && <span className="pt-1 text-[11px] font-semibold text-muted-foreground">Modelos do sistema</span>}
          <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            {MODELOS_DOCUMENTOS.map((m) => {
              const Icone = ICONES[m.id] ?? FileText;
              const ativo = modeloSelecionado === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => aplicarModelo(m.id, modeloDocumento(m.id))}
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

      {documento && <SalvarComoModelo titulo={titulo} anotacoes={anotacoes} prescricao={prescricao} />}
    </FormAcao>
  );
}

/** Guarda o texto atual como modelo pessoal (fica em Documentos e timbrado, em Meus modelos). */
function SalvarComoModelo({ titulo, anotacoes, prescricao }: { titulo: string; anotacoes: string; prescricao: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const avisar = useAviso();
  const vazio = !anotacoes.trim() && !titulo.trim();

  if (!aberto) {
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={vazio}
          onClick={() => {
            setNome(titulo);
            setAberto(true);
          }}
        >
          <BookmarkPlus className="size-4" /> Salvar como modelo
        </Button>
      </div>
    );
  }

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await salvarComoModeloAcao({ nome, titulo, anotacoes, prescricao });
      if (r.erro) return setErro(r.erro);
      avisar?.(r.sucesso ?? "Modelo salvo");
      setAberto(false);
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
      <Label htmlFor="salvar-modelo-nome">Nome do novo modelo</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="salvar-modelo-nome"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter neste campo salva o modelo, sem enviar o rascunho.
            if (e.key === "Enter") {
              e.preventDefault();
              salvar();
            }
          }}
          className="min-w-48 flex-1"
        />
        <Button type="button" size="sm" onClick={salvar} disabled={pendente || nome.trim().length < 2}>
          {pendente ? "Salvando…" : "Salvar modelo"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <p className="text-[11px] text-muted-foreground">Só o texto vai para o modelo. Revise para não levar dados do paciente.</p>
    </div>
  );
}
