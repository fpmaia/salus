"use client";

import { useState } from "react";
import { Sparkles, FileText, School, Send, CheckSquare } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { horarioLocal } from "@/src/domain/tempo";

const textarea =
  "min-h-36 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-sans leading-relaxed";

type Atendimento = { id: string; status: string; inicio: Date };
type RegistroEdicao = {
  id?: string;
  agendamentoId?: string | null;
  conteudo: { anotacoes: string; prescricao: string };
};

export const MODELOS_DOCUMENTOS = [
  {
    id: "padrao",
    nome: "Evolução Livre",
    icone: FileText,
    descricao: "Anotações habituais de sessão ou consulta.",
    anotacoes: "",
    prescricao: "",
  },
  {
    id: "cfp_relatorio",
    nome: "Relatório Psicológico (CFP 06/2019)",
    icone: Sparkles,
    descricao: "Estrutura regulatória formal completa do Conselho Federal de Psicologia.",
    anotacoes: `RELATÓRIO PSICOLÓGICO

I. IDENTIFICAÇÃO
Nome do(a) Paciente: 
Data de Nascimento: 
Responsável Legal (se aplicável): 
Profissional Responsável: 
Conselho / Registro (CRP): 

II. DESCRIÇÃO DA DEMANDA
(Descrever o motivo do encaminhamento, histórico breve, queixa principal relatada pelo paciente/família e os objetivos do acompanhamento)

III. PROCEDIMENTO
(Indicar o número de sessões realizadas até o momento, abordagem teórica utilizada, técnicas ou instrumentos de avaliação psicológica aplicados)
- Abordagem: 
- Total de sessões realizadas: 

IV. ANÁLISE E EVOLUÇÃO CLÍNICA
(Apresentar os aspectos emocionais, cognitivos, comportamentais e relacionais observados de forma ética e fundamentada, resguardando o sigilo profissional)

V. CONCLUSÃO E ENCAMINHAMENTO
(Síntese das considerações finais, orientações clínicas, recomendações terapêuticas e encaminhamentos a outros profissionais quando pertinente)`,
    prescricao: "Recomenda-se continuidade do acompanhamento psicoterapêutico semanal.",
  },
  {
    id: "escolar",
    nome: "Relatório para Fins Escolares",
    icone: School,
    descricao: "Direcionado a coordenadores e equipe pedagógica com orientações de manejo.",
    anotacoes: `RELATÓRIO DE ACOMPANHAMENTO TERAPÊUTICO PARA FINS ESCOLARES

I. DADOS DE IDENTIFICAÇÃO
Nome do(a) Aluno(a): 
Data de Nascimento: 
Escola / Série: 
Terapeuta Responsável: 
Registro Profissional: 

II. OBJETIVO DO DOCUMENTO
Prestar esclarecimentos à equipe pedagógica e fornecer subsídios e orientações de acolhimento e manejo comportamental/emocional no ambiente escolar.

III. OBSERVAÇÕES CLÍNICAS EM CONSULTÓRIO
(Aspectos observados quanto à atenção, autorregulação emocional, socialização com pares e tolerância a frustrações)

IV. ORIENTAÇÕES SUGERIDAS À EQUIPE ESCOLAR
1. Prever pausas estruturadas para autorregulação quando notar sobrecarga sensorial ou cansaço;
2. Apresentar instruções em etapas curtas, diretas e com confirmação de entendimento;
3. Incentivar a autonomia em tarefas acadêmicas com reforço positivo dos esforços;
4. Manter canal de diálogo fluido e transparente entre família, escola e terapeuta.`,
    prescricao: "Equipe disponível para alinhamento pedagógico conjunto caso necessário.",
  },
  {
    id: "encaminhamento",
    nome: "Encaminhamento Multidisciplinar",
    icone: Send,
    descricao: "Para psiquiatras, neurologistas, fonoaudiólogos ou outros especialistas.",
    anotacoes: `ENCAMINHAMENTO CLÍNICO MULTIDISCIPLINAR

Ao(À) Colega Especialista: Dr(a). 
Especialidade: (Psiquiatria / Neurologia / Outra)

Prezado(a) Colega,

Encaminho o(a) paciente acima citado(a), atualmente em acompanhamento terapêutico nesta clínica, para avaliação especializada e conduta compartilhada.

1. RESUMO CLÍNICO E MOTIVO DO ENCAMINHAMENTO:
(Descrever queixas, início e evolução dos sintomas, histórico relevante, sono, apetite, variações de humor ou ansiedade)

2. CONSIDERAÇÕES E OBJETIVOS DA AVALIAÇÃO:
Solicito avaliação médica complementar para investigação diagnóstica e ponderação quanto à indicação de suporte medicamentoso adjuvante.

Coloco-me à disposição para discussão conjunta do caso.`,
    prescricao: "",
  },
  {
    id: "declaracao",
    nome: "Declaração de Acompanhamento",
    icone: CheckSquare,
    descricao: "Comprovação de frequência para trabalho, escola, plano ou fins judiciais.",
    anotacoes: `DECLARAÇÃO DE ACOMPANHAMENTO TERAPÊUTICO

Declaro para os devidos fins que o(a) paciente acima identificado(a) encontra-se sob acompanhamento regular nesta clínica, realizando sessões de psicoterapia/terapia sob minha responsabilidade profissional.

- Frequência: Semanal (sessões de 50 minutos)
- Horário habitual de atendimento: 
- Início do acompanhamento: 

O acompanhamento segue ativo por tempo indeterminado.`,
    prescricao: "",
  },
];

export function EditorRegistroComModelos({
  acao,
  atendimentos,
  registro,
}: {
  acao: Parameters<typeof FormAcao>[0]["acao"];
  atendimentos: Atendimento[];
  registro?: RegistroEdicao;
}) {
  const [anotacoes, setAnotacoes] = useState(registro?.conteudo.anotacoes ?? "");
  const [prescricao, setPrescricao] = useState(registro?.conteudo.prescricao ?? "");
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("padrao");

  const aplicarModelo = (modeloId: string) => {
    const mod = MODELOS_DOCUMENTOS.find((m) => m.id === modeloId);
    if (!mod) return;
    if (anotacoes.trim() && !window.confirm("Substituir o conteúdo atual pelo modelo selecionado?")) {
      return;
    }
    setAnotacoes(mod.anotacoes);
    if (mod.prescricao) {
      setPrescricao(mod.prescricao);
    }
    setModeloSelecionado(modeloId);
  };

  return (
    <FormAcao key={registro?.id ?? "novo"} acao={acao} textoBotao={registro ? "Salvar rascunho" : "Criar rascunho"} className="flex flex-col gap-5">
      {/* Seletor Rápido de Modelos de Documentos Clínicos */}
      {!registro && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
              <Sparkles className="size-3.5 text-primary" /> Modelos Rápidos de Relatórios & Laudos
            </span>
            <span className="text-[11px] text-muted-foreground">Preenchimento com 1 clique</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
            {MODELOS_DOCUMENTOS.filter((m) => m.id !== "padrao").map((m) => {
              const Icone = m.icone;
              const ativo = modeloSelecionado === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => aplicarModelo(m.id)}
                  className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                    ativo
                      ? "border-primary bg-primary/15 shadow-2xs ring-1 ring-primary"
                      : "border-border/70 bg-background hover:bg-muted/50"
                  }`}
                >
                  <Icone className="size-4 shrink-0 mt-0.5 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-foreground leading-tight">{m.nome}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{m.descricao}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {atendimentos.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`at-${registro?.id ?? "novo"}`}>Atendimento vinculado</Label>
          <NativeSelect id={`at-${registro?.id ?? "novo"}`} name="agendamentoId" defaultValue={registro?.agendamentoId ?? atendimentos[0]?.id ?? ""}>
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
          <Label htmlFor={`an-${registro?.id ?? "novo"}`}>Evolução / Relatório Clínico</Label>
          <span className="text-[11px] text-muted-foreground">Sigilo profissional resguardado</span>
        </div>
        <textarea
          id={`an-${registro?.id ?? "novo"}`}
          name="anotacoes"
          className={textarea}
          value={anotacoes}
          onChange={(e) => setAnotacoes(e.target.value)}
          placeholder="Descreva a evolução da sessão ou selecione um modelo de relatório acima..."
          rows={12}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`pr-${registro?.id ?? "novo"}`}>Orientações, Recomendações ou Prescrição (opcional)</Label>
        <textarea
          id={`pr-${registro?.id ?? "novo"}`}
          name="prescricao"
          className={textarea}
          value={prescricao}
          onChange={(e) => setPrescricao(e.target.value)}
          placeholder="Orientações aos pais, escola, recomendações de manejo ou encaminhamentos..."
          rows={3}
        />
      </div>
    </FormAcao>
  );
}
