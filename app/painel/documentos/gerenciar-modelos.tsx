"use client";

import { useState } from "react";
import { Copy, FileText, Pencil, Plus, X } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMITE_TITULO } from "@/src/domain/prontuario";
import type { Modelo } from "@/src/server/documentos-personalizados";
import type { Escopo } from "@/src/server/documentos-personalizados";
import { excluirModeloAcao, salvarModeloAcao } from "./actions";

const textarea =
  "min-h-32 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type ModeloBase = Pick<Modelo, "nome" | "titulo" | "anotacoes" | "prescricao"> & { descricao?: string | null };
type Edicao = { id: string | null; valores: ModeloBase };

type Props = {
  /** Escopo que este usuário mantém ("clinica" para o admin, "meu" para o profissional). */
  escopo: Escopo;
  editaveis: Modelo[];
  /** Modelos que só servem de ponto de partida (sistema e, para o profissional, os da clínica). */
  referencias: { grupo: string; modelos: (ModeloBase & { id: string })[] }[];
};

export function GerenciarModelos({ escopo, editaveis, referencias }: Props) {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const novo = () => setEdicao({ id: null, valores: { nome: "", titulo: "", anotacoes: "", prescricao: "" } });
  const duplicar = (m: ModeloBase) => setEdicao({ id: null, valores: { ...m, nome: `${m.nome} (cópia)`.slice(0, 80) } });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{escopo === "clinica" ? "Modelos da clínica" : "Meus modelos"}</h3>
          <Button type="button" size="sm" onClick={novo}>
            <Plus className="size-4" /> Novo modelo
          </Button>
        </div>

        {edicao && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{edicao.id ? "Editar modelo" : "Novo modelo"}</p>
              <button type="button" onClick={() => setEdicao(null)} aria-label="Fechar edição" className="rounded-md p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <FormModelo
              key={edicao.id ?? `novo-${edicao.valores.nome}`}
              acao={salvarModeloAcao.bind(null, escopo, edicao.id)}
              valores={edicao.valores}
              aoConcluir={() => setEdicao(null)}
            />
          </div>
        )}

        {editaveis.length === 0 && !edicao ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nenhum modelo ainda</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Crie do zero ou duplique um dos modelos abaixo. {escopo === "clinica" ? "Os modelos da clínica aparecem para todos os profissionais." : "Só você vê os seus modelos."}
            </p>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {editaveis.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.nome}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{m.descricao || m.titulo || m.anotacoes.slice(0, 120)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEdicao({ id: m.id, valores: m })} aria-label={`Editar ${m.nome}`}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <FormAcao
                    acao={excluirModeloAcao.bind(null, escopo, m.id)}
                    textoBotao="Excluir"
                    textoPendente="Excluindo…"
                    variante="outline"
                    confirmar={`Excluir o modelo "${m.nome}"? Documentos já criados com ele não mudam.`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {referencias.map(({ grupo, modelos }) =>
        modelos.length === 0 ? null : (
          <section key={grupo} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{grupo}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {modelos.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.nome}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{m.descricao || m.titulo}</p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => duplicar(m)} aria-label={`Duplicar ${m.nome}`}>
                    <Copy className="size-3.5" /> Duplicar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function FormModelo({
  acao,
  valores,
  aoConcluir,
}: {
  acao: Parameters<typeof FormAcao>[0]["acao"];
  valores: ModeloBase;
  aoConcluir: () => void;
}) {
  return (
    <FormAcao acao={acao} textoBotao="Salvar modelo" className="flex flex-col gap-4" aoConcluir={aoConcluir}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mod-nome">Nome do modelo</Label>
          <Input id="mod-nome" name="nome" defaultValue={valores.nome} required maxLength={80} placeholder="Ex.: Atestado de repouso" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mod-descricao">Descrição (opcional)</Label>
          <Input id="mod-descricao" name="descricao" defaultValue={valores.descricao ?? ""} maxLength={160} placeholder="Quando usar este modelo" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mod-titulo">Título do documento</Label>
        <Input id="mod-titulo" name="titulo" defaultValue={valores.titulo} maxLength={LIMITE_TITULO} placeholder="Ex.: Atestado médico" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mod-anotacoes">Texto</Label>
        <textarea id="mod-anotacoes" name="anotacoes" className={textarea} rows={10} defaultValue={valores.anotacoes} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mod-prescricao">Orientações ou recomendações (opcional)</Label>
        <textarea id="mod-prescricao" name="prescricao" className={textarea} rows={3} defaultValue={valores.prescricao} />
      </div>
    </FormAcao>
  );
}
