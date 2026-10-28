// Modelos de documentos clínicos (relatório, laudo, declaração…). Domínio puro: o editor
// preenche título e texto com o modelo e o profissional ajusta antes de finalizar.

export type ModeloDocumento = {
  id: string;
  nome: string;
  descricao: string;
  /** Área a que o modelo se destina; "geral" serve a qualquer profissão. */
  area: "geral" | "psicologia";
  titulo: string;
  anotacoes: string;
  prescricao: string;
};

export const MODELOS_DOCUMENTOS: ModeloDocumento[] = [
  {
    id: "em_branco",
    nome: "Documento em branco",
    descricao: "Título e texto livres.",
    area: "geral",
    titulo: "",
    anotacoes: "",
    prescricao: "",
  },
  {
    id: "relatorio_clinico",
    nome: "Relatório clínico",
    descricao: "Resumo do acompanhamento para o paciente, outro profissional ou convênio.",
    area: "geral",
    titulo: "Relatório clínico",
    anotacoes: `RELATÓRIO CLÍNICO

1. IDENTIFICAÇÃO
Paciente:
Data de nascimento:
Solicitante / finalidade:

2. MOTIVO DO ATENDIMENTO
(Queixa principal e histórico relevante)

3. ACOMPANHAMENTO REALIZADO
(Período, frequência, número de atendimentos e condutas adotadas)

4. EVOLUÇÃO E SITUAÇÃO ATUAL
(Resultados observados e quadro atual)

5. CONCLUSÃO
(Síntese e recomendações)`,
    prescricao: "",
  },
  {
    id: "laudo",
    nome: "Laudo / parecer",
    descricao: "Resultado de avaliação com conclusão técnica.",
    area: "geral",
    titulo: "Laudo",
    anotacoes: `LAUDO

1. IDENTIFICAÇÃO
Paciente:
Data de nascimento:
Solicitante:

2. OBJETIVO DA AVALIAÇÃO
(O que foi solicitado e para qual finalidade)

3. PROCEDIMENTOS E INSTRUMENTOS
(Datas, métodos, testes ou exames utilizados)

4. ANÁLISE
(Resultados e interpretação técnica)

5. CONCLUSÃO
(Parecer conclusivo)`,
    prescricao: "",
  },
  {
    id: "atestado_comparecimento",
    nome: "Atestado de comparecimento",
    descricao: "Comprova que o paciente esteve no atendimento em data e horário.",
    area: "geral",
    titulo: "Atestado de comparecimento",
    anotacoes: `ATESTADO DE COMPARECIMENTO

Atesto, para os devidos fins, que o(a) paciente acima identificado(a) compareceu a atendimento nesta data, no horário das ___h___ às ___h___.`,
    prescricao: "",
  },
  {
    id: "declaracao",
    nome: "Declaração de acompanhamento",
    descricao: "Comprova acompanhamento regular para trabalho, escola, plano ou fins judiciais.",
    area: "geral",
    titulo: "Declaração de acompanhamento",
    anotacoes: `DECLARAÇÃO DE ACOMPANHAMENTO

Declaro, para os devidos fins, que o(a) paciente acima identificado(a) encontra-se em acompanhamento regular sob minha responsabilidade profissional.

- Frequência:
- Horário habitual:
- Início do acompanhamento:

O acompanhamento segue ativo.`,
    prescricao: "",
  },
  {
    id: "encaminhamento",
    nome: "Encaminhamento",
    descricao: "Para outro profissional ou especialidade, com resumo do caso.",
    area: "geral",
    titulo: "Encaminhamento",
    anotacoes: `ENCAMINHAMENTO

Ao(À) colega:
Especialidade:

Encaminho o(a) paciente acima identificado(a), em acompanhamento nesta clínica, para avaliação e conduta compartilhada.

1. RESUMO DO CASO E MOTIVO DO ENCAMINHAMENTO
(Queixas, início e evolução, histórico relevante)

2. O QUE SE ESPERA DA AVALIAÇÃO
(Pergunta clínica ou objetivo)

Coloco-me à disposição para discussão do caso.`,
    prescricao: "",
  },
  {
    id: "cfp_relatorio",
    nome: "Relatório psicológico (CFP 06/2019)",
    descricao: "Estrutura da Resolução CFP nº 06/2019.",
    area: "psicologia",
    titulo: "Relatório psicológico",
    anotacoes: `RELATÓRIO PSICOLÓGICO

I. IDENTIFICAÇÃO
Nome do(a) paciente:
Data de nascimento:
Responsável legal (se aplicável):
Profissional responsável:
CRP:
Solicitante e finalidade:

II. DESCRIÇÃO DA DEMANDA
(Motivo do encaminhamento, histórico breve, queixa principal e objetivos do acompanhamento)

III. PROCEDIMENTO
(Número de sessões, abordagem teórica, técnicas ou instrumentos utilizados)

IV. ANÁLISE
(Aspectos emocionais, cognitivos, comportamentais e relacionais, de forma ética e fundamentada, resguardando o sigilo)

V. CONCLUSÃO
(Síntese, orientações e encaminhamentos quando pertinente)`,
    prescricao: "Recomenda-se a continuidade do acompanhamento psicoterapêutico.",
  },
  {
    id: "escolar",
    nome: "Relatório para a escola",
    descricao: "Para a equipe pedagógica, com orientações de manejo.",
    area: "psicologia",
    titulo: "Relatório para fins escolares",
    anotacoes: `RELATÓRIO DE ACOMPANHAMENTO PARA FINS ESCOLARES

I. IDENTIFICAÇÃO
Aluno(a):
Data de nascimento:
Escola / série:
Profissional responsável:

II. OBJETIVO
Prestar esclarecimentos à equipe pedagógica e oferecer orientações de acolhimento e manejo no ambiente escolar.

III. OBSERVAÇÕES DO ACOMPANHAMENTO
(Atenção, autorregulação, socialização, tolerância a frustrações)

IV. ORIENTAÇÕES À ESCOLA
1. Prever pausas estruturadas quando houver sobrecarga ou cansaço;
2. Dar instruções em etapas curtas, confirmando o entendimento;
3. Reforçar positivamente os esforços e a autonomia;
4. Manter diálogo entre família, escola e profissional.`,
    prescricao: "Disponível para alinhamento com a equipe pedagógica.",
  },
];

export function modeloDocumento(id: string): ModeloDocumento | undefined {
  return MODELOS_DOCUMENTOS.find((m) => m.id === id);
}
