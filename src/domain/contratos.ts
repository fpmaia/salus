import { z } from "zod";
import { formatarMoeda, formatarPercentual } from "./dinheiro";
import { horasTexto, turnoFixo, type Acordo } from "./financeiro";

// Contrato do profissional = acordo financeiro versionado + grade fixa opcional + termos.
// Aqui: a grade semanal, a descrição das condições (telas e minuta) e a minuta padrão.

export const DIAS_SEMANA_NOMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const itemGradeSchema = z
  .object({
    diaSemana: z.coerce.number().int().min(0).max(6),
    horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora deve ser HH:MM"),
    horaFim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora deve ser HH:MM"),
  })
  .refine((val) => val.horaFim > val.horaInicio, {
    message: "O horário de término deve ser posterior ao horário de início",
    path: ["horaFim"],
  });

export type ItemGrade = z.infer<typeof itemGradeSchema>;

export const gradeHorariosSchema = z
  .array(itemGradeSchema)
  .min(1, "Adicione pelo menos um dia e horário fixo na grade semanal")
  .refine(
    (itens) => {
      for (let i = 0; i < itens.length; i++) {
        for (let j = i + 1; j < itens.length; j++) {
          const a = itens[i];
          const b = itens[j];
          if (a.diaSemana === b.diaSemana && a.horaInicio < b.horaFim && b.horaInicio < a.horaFim) return false;
        }
      }
      return true;
    },
    { message: "Existem horários conflitantes para o mesmo dia da semana na grade" },
  );

export function formatarGradeHorariosTexto(grade: ItemGrade[]): string {
  if (!grade || grade.length === 0) return "Nenhum horário cadastrado";
  return [...grade]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio))
    .map((g) => `${DIAS_SEMANA_NOMES[g.diaSemana]}: das ${g.horaInicio} às ${g.horaFim}`)
    .join("; ");
}

type CondicoesDoContrato = Pick<
  Acordo,
  | "modelo"
  | "fluxoRecebimento"
  | "valorHoraCentavos"
  | "valorConsultaCentavos"
  | "percentualBp"
  | "mensalidadeCentavos"
  | "horasIncluidas"
  | "regraFalta"
  | "faltaPercentualBp"
  | "prazoCancelamentoHoras"
  | "multaCancelamentoReservaBp"
>;

/** Condições financeiras em frases curtas (telas, extrato e minuta). */
export function descreverCondicoes(a: CondicoesDoContrato): string[] {
  const linhas: string[] = [];
  if (a.modelo === "hora" && a.valorHoraCentavos) linhas.push(`${formatarMoeda(a.valorHoraCentavos)} por hora reservada`);
  if (a.modelo === "consulta" && a.valorConsultaCentavos) linhas.push(`${formatarMoeda(a.valorConsultaCentavos)} por consulta realizada`);
  if (a.modelo === "percentual" && a.percentualBp) linhas.push(`${formatarPercentual(a.percentualBp)} do valor de cada atendimento`);
  if ((a.modelo === "mensalidade" || a.modelo === "sala_fixa") && a.mensalidadeCentavos) {
    if (turnoFixo(a)) {
      linhas.push(`Mensalidade de ${formatarMoeda(a.mensalidadeCentavos)} pelo turno fixo`);
      if (a.valorHoraCentavos) linhas.push(`Reservas fora do turno fixo: ${formatarMoeda(a.valorHoraCentavos)} por hora`);
      if (a.valorConsultaCentavos) linhas.push(`Mais ${formatarMoeda(a.valorConsultaCentavos)} por consulta realizada`);
      if (a.percentualBp) linhas.push(`Mais ${formatarPercentual(a.percentualBp)} de cada atendimento`);
    } else {
      linhas.push(`Mensalidade de ${formatarMoeda(a.mensalidadeCentavos)} com ${a.horasIncluidas}h incluídas`);
      if (a.valorHoraCentavos) linhas.push(`Horas além do pacote: ${formatarMoeda(a.valorHoraCentavos)} por hora`);
    }
  }
  linhas.push(a.fluxoRecebimento === "centralizado" ? "O paciente paga ao espaço, que repassa ao profissional" : "O paciente paga direto ao profissional");
  linhas.push(
    a.regraFalta === "isenta"
      ? "Falta ou cancelamento tardio do paciente: sem cobrança"
      : a.regraFalta === "integral"
        ? "Falta ou cancelamento tardio do paciente: cobrança integral"
        : `Falta ou cancelamento tardio do paciente: ${formatarPercentual(a.faltaPercentualBp ?? 0)} do valor`,
  );
  if (a.prazoCancelamentoHoras !== undefined) linhas.push(`Cancelamento sem custo até ${a.prazoCancelamentoHoras}h antes`);
  if (a.modelo === "hora" && a.multaCancelamentoReservaBp) {
    linhas.push(`Turno fixo cancelado depois do prazo: ${formatarPercentual(a.multaCancelamentoReservaBp)} das horas da data`);
  }
  return linhas;
}

export interface DadosMinutaPadrao {
  clinicaNome: string;
  clinicaDocumento?: string | null;
  profissionalNome: string;
  profissionalConselho?: string | null;
  profissionalRegistro?: string | null;
  codigo: string;
  /** Sala da grade fixa (ou dedicada), se houver. */
  salaNome?: string | null;
  condicoes: string[];
  dataInicio: string;
  dataFim?: string | null;
  gradeHorarios: ItemGrade[];
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function gerarMinutaContratoPadrao(dados: DadosMinutaPadrao): string {
  const docClinica = dados.clinicaDocumento ? `inscrita sob o nº ${dados.clinicaDocumento}` : "estabelecida neste município";
  const registroProfissional =
    dados.profissionalConselho && dados.profissionalRegistro
      ? `${dados.profissionalConselho} nº ${dados.profissionalRegistro}`
      : "profissional devidamente habilitado";
  const vigenciaFim = dados.dataFim ? `até ${dataBr(dados.dataFim)}` : "por tempo indeterminado";
  const temGrade = dados.gradeHorarios.length > 0;

  const objeto = dados.salaNome
    ? `a cessão de uso do consultório **"${dados.salaNome}"**, situado nas dependências da CLÍNICA${temGrade ? ", nos dias e horários da cláusula segunda" : ""}`
    : "a cessão de uso, mediante reserva, dos consultórios disponíveis nas dependências da CLÍNICA";

  const clausulaGrade = temGrade
    ? `### CLÁUSULA SEGUNDA - DA GRADE FIXA DE DIAS E HORÁRIOS
2.1. O PROFISSIONAL terá uso exclusivo do consultório nos seguintes dias e horários semanais:
> **${formatarGradeHorariosTexto(dados.gradeHorarios)}**

2.2. Esses horários ficam reservados automaticamente na agenda da CLÍNICA. O uso fora deles depende de reserva avulsa no sistema.`
    : `### CLÁUSULA SEGUNDA - DAS RESERVAS
2.1. O PROFISSIONAL reserva os consultórios pelo sistema da CLÍNICA, conforme a disponibilidade.`;

  return `# CONTRATO DE CESSÃO DE USO DE CONSULTÓRIO EM ESPAÇO DE SAÚDE COMPARTILHADO

Contrato nº **${dados.codigo}**.

**CLÍNICA:** **${dados.clinicaNome.toUpperCase()}**, ${docClinica}.

**PROFISSIONAL:** **${dados.profissionalNome.toUpperCase()}**, ${registroProfissional}.

As partes acima ajustam o presente contrato, nas cláusulas a seguir.

---

### CLÁUSULA PRIMEIRA - DO OBJETO
1.1. O objeto deste contrato é ${objeto}.
1.2. O espaço destina-se exclusivamente a atividades profissionais de saúde compatíveis com a especialidade do PROFISSIONAL, observadas as normas do respectivo Conselho e da Vigilância Sanitária.

---

${clausulaGrade}

---

### CLÁUSULA TERCEIRA - DAS CONDIÇÕES FINANCEIRAS
${dados.condicoes.map((c, i) => `3.${i + 1}. ${c}.`).join("\n")}
3.${dados.condicoes.length + 1}. Os valores são apurados mensalmente no extrato do PROFISSIONAL no sistema da CLÍNICA.

---

### CLÁUSULA QUARTA - DAS RESPONSABILIDADES DO PROFISSIONAL
4.1. O PROFISSIONAL é o único responsável civil, ético e técnico pelos atendimentos, diagnósticos, prescrições e registros clínicos de seus pacientes.
4.2. O PROFISSIONAL declara manter inscrição ativa e regular perante seu Conselho Profissional.
4.3. O PROFISSIONAL zelará pela conservação dos móveis, equipamentos e instalações, indenizando danos causados por dolo ou culpa.

---

### CLÁUSULA QUINTA - DA VIGÊNCIA E RESCISÃO
5.1. Este contrato vigora a partir de **${dataBr(dados.dataInicio)}**, **${vigenciaFim}**.
5.2. Qualquer das partes pode rescindi-lo mediante aviso por escrito com 30 (trinta) dias de antecedência.
5.3. Reajustes de valores são formalizados por nova versão deste contrato, sem efeito sobre os meses anteriores.

---

### CLÁUSULA SEXTA - DO FORO
6.1. Fica eleito o foro da Comarca onde se localiza a CLÍNICA.

Local e data: _________________________________, _____ de _________________ de 20____.


_____________________________________________
**${dados.clinicaNome}**
*(Clínica)*


_____________________________________________
**${dados.profissionalNome}**
*${registroProfissional}*
*(Profissional)*
`;
}

/** O que o profissional precisa saber do contrato para estimar o custo de uma reserva avulsa. */
export type RegraDePreco = Pick<
  Acordo,
  "modelo" | "valorHoraCentavos" | "valorConsultaCentavos" | "percentualBp" | "mensalidadeCentavos" | "horasIncluidas"
> & {
  /** Minutos de reservas concluídas no mês (consumo do pacote). */
  minutosUsadosNoMes: number;
};

/**
 * Custo estimado de uma reserva avulsa de `minutos`, pelo contrato vigente. `valorCentavos`
 * null = a reserva em si não tem preço por hora (cobra por atendimento) ou não há contrato.
 */
export function estimarReserva(regra: RegraDePreco | null, minutos: number): { valorCentavos: number | null; texto: string } {
  if (!regra) return { valorCentavos: null, texto: "Sem contrato vigente: o valor é combinado com o espaço." };
  const pelaHora = (m: number) => (regra.valorHoraCentavos ? Math.round((m * regra.valorHoraCentavos) / 60) : 0);
  if (minutos <= 0) return { valorCentavos: null, texto: "Informe o horário para ver o valor." };

  if (regra.modelo === "hora" && regra.valorHoraCentavos) {
    return {
      valorCentavos: pelaHora(minutos),
      texto: `${formatarMoeda(pelaHora(minutos))} (${horasTexto(minutos)} × ${formatarMoeda(regra.valorHoraCentavos)}/h)`,
    };
  }
  if (regra.modelo === "consulta" && regra.valorConsultaCentavos) {
    return { valorCentavos: null, texto: `Sem custo por hora: ${formatarMoeda(regra.valorConsultaCentavos)} por consulta realizada.` };
  }
  if (regra.modelo === "percentual" && regra.percentualBp) {
    return { valorCentavos: null, texto: `Sem custo por hora: ${formatarPercentual(regra.percentualBp)} de cada atendimento.` };
  }
  if (turnoFixo(regra)) {
    const valor = pelaHora(minutos);
    return valor > 0
      ? { valorCentavos: valor, texto: `${formatarMoeda(valor)}: fora do turno fixo, ${formatarMoeda(regra.valorHoraCentavos!)}/h` }
      : { valorCentavos: 0, texto: "Sem custo extra além da mensalidade." };
  }
  if (regra.modelo === "mensalidade" && regra.horasIncluidas !== null) {
    const restante = Math.max(regra.horasIncluidas * 60 - regra.minutosUsadosNoMes, 0);
    const excedente = Math.max(minutos - restante, 0);
    if (excedente === 0) {
      return { valorCentavos: 0, texto: `Coberta pelo pacote: restam ${horasTexto(restante)} de ${regra.horasIncluidas}h este mês.` };
    }
    const valor = pelaHora(excedente);
    return {
      valorCentavos: valor,
      texto: `${horasTexto(excedente)} além do pacote${valor > 0 ? `: ${formatarMoeda(valor)}` : ""} (restam ${horasTexto(restante)} de ${regra.horasIncluidas}h).`,
    };
  }
  return { valorCentavos: null, texto: "O valor é combinado com o espaço." };
}
