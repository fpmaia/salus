import { z } from "zod";
import { formatarMoeda } from "./dinheiro";

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
      // Verifica sobreposição dentro do mesmo dia da semana
      for (let i = 0; i < itens.length; i++) {
        for (let j = i + 1; j < itens.length; j++) {
          const a = itens[i];
          const b = itens[j];
          if (a.diaSemana === b.diaSemana) {
            const sobrepoe = a.horaInicio < b.horaFim && b.horaInicio < a.horaFim;
            if (sobrepoe) return false;
          }
        }
      }
      return true;
    },
    { message: "Existem horários conflitantes para o mesmo dia da semana na grade" },
  );

export const contratoInputSchema = z.object({
  profissionalId: z.string().uuid("Selecione um profissional válido"),
  salaId: z.string().uuid("Selecione uma sala válida"),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida"),
  dataFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de término inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  valorMensalCentavos: z.coerce.number().int().min(0, "Valor mensal deve ser maior ou igual a zero"),
  diaVencimento: z.coerce.number().int().min(1).max(31, "Dia de vencimento deve estar entre 1 e 31"),
  cobrancaConsultaTipo: z.enum(["nenhuma", "fixo", "percentual"]).default("nenhuma"),
  cobrancaConsultaValorCentavos: z.coerce.number().int().min(0).optional(),
  cobrancaConsultaPercentualBp: z.coerce.number().int().min(0).max(10000).optional(),
  gradeHorarios: gradeHorariosSchema,
  termosContrato: z.string().min(50, "Os termos do contrato devem ser informados"),
  observacoes: z.string().max(1000).optional(),
});

export type ContratoInput = z.infer<typeof contratoInputSchema>;

export function formatarGradeHorariosTexto(grade: ItemGrade[]): string {
  if (!grade || grade.length === 0) return "Nenhum horário cadastrado";
  const ordenado = [...grade].sort((a, b) => {
    if (a.diaSemana !== b.diaSemana) return a.diaSemana - b.diaSemana;
    return a.horaInicio.localeCompare(b.horaInicio);
  });

  return ordenado
    .map((g) => `${DIAS_SEMANA_NOMES[g.diaSemana]}: das ${g.horaInicio} às ${g.horaFim}`)
    .join("; ");
}

export interface DadosMinutaPadrao {
  clinicaNome: string;
  clinicaDocumento?: string | null;
  profissionalNome: string;
  profissionalConselho?: string | null;
  profissionalRegistro?: string | null;
  salaNome: string;
  valorMensalCentavos: number;
  diaVencimento: number;
  dataInicio: string;
  dataFim?: string | null;
  gradeHorarios: ItemGrade[];
  cobrancaConsultaTipo?: string;
  cobrancaConsultaValorCentavos?: number | null;
  cobrancaConsultaPercentualBp?: number | null;
}

export function gerarMinutaContratoPadrao(dados: DadosMinutaPadrao): string {
  const valorFormatado = formatarMoeda(dados.valorMensalCentavos);
  const gradeFormatada = formatarGradeHorariosTexto(dados.gradeHorarios);
  const docClinica = dados.clinicaDocumento ? `inscrita no CNPJ/MF sob o nº ${dados.clinicaDocumento}` : "estabelecida neste município";
  const registroProfissional = dados.profissionalConselho && dados.profissionalRegistro
    ? `${dados.profissionalConselho} nº ${dados.profissionalRegistro}`
    : "profissional devidamente habilitado";
  const vigenciaFim = dados.dataFim ? `até ${dados.dataFim}` : "por tempo indeterminado";

  let clausulaTaxa = "Não haverá cobrança adicional por consulta realizada.";
  if (dados.cobrancaConsultaTipo === "fixo" && dados.cobrancaConsultaValorCentavos) {
    clausulaTaxa = `Além da mensalidade fixa, será devida à LOCADORA a taxa de ${formatarMoeda(dados.cobrancaConsultaValorCentavos)} por consulta realizada.`;
  } else if (dados.cobrancaConsultaTipo === "percentual" && dados.cobrancaConsultaPercentualBp) {
    const perc = (dados.cobrancaConsultaPercentualBp / 100).toFixed(1).replace(".0", "");
    clausulaTaxa = `Além da mensalidade fixa, a LOCADORA reterá ${perc}% sobre o valor de cada consulta atendida.`;
  }

  return `# CONTRATO DE LOCAÇÃO E CESSÃO DE USO DE CONSULTÓRIO EM ESPAÇO DE SAÚDE COMPARTILHADO

Pelo presente instrumento particular, de um lado:

**LOCADORA / ADMINISTRADORA:** **${dados.clinicaNome.toUpperCase()}**, ${docClinica}, doravante denominada simplesmente **CLÍNICA**;

E, de outro lado:

**LOCATÁRIO(A):** **${dados.profissionalNome.toUpperCase()}**, inscrito(a) perante o **${registroProfissional}**, doravante denominado(a) simplesmente **PROFISSIONAL**;

Têm, entre si, justo e contratado o presente Contrato de Locação e Cessão de Espaço para Atendimento em Saúde, mediante as seguintes cláusulas e condições:

---

### CLÁUSULA PRIMEIRA - DO OBJETO E DESTINAÇÃO
1.1. O presente instrumento tem por objeto a cessão de uso e locação fixa das dependências do consultório denominado **"${dados.salaNome}"**, situado nas dependências da CLÍNICA.
1.2. O espaço destina-se com exclusividade ao exercício de atividades profissionais de saúde, consultas, exames e terapias compatíveis com a especialidade do PROFISSIONAL, observadas as normas legais e éticas do respectivo Conselho Profissional e da Vigilância Sanitária (ANVISA).

---

### CLÁUSULA SEGUNDA - DA GRADE FIXA DE DIAS E HORÁRIOS
2.1. O PROFISSIONAL terá direito ao uso exclusivo do consultório nos seguintes dias e horários semanais pré-fixados:
> **${gradeFormatada}**

2.2. Os horários supramencionados constarão automaticamente como reservados na agenda eletrônica da CLÍNICA e disponibilizados para agendamento dos pacientes no link pessoal do PROFISSIONAL.
2.3. A ocupação fora dos dias e horários acima pactuados dependerá de prévia consulta e reserva avulsa no sistema.

---

### CLÁUSULA TERCEIRA - DO VALOR E FORMA DE PAGAMENTO
3.1. Pela locação e cessão de uso do consultório, o PROFISSIONAL pagará à CLÍNICA a mensalidade fixa de **${valorFormatado}** (mensais).
3.2. O pagamento da mensalidade deverá ser efetuado impreterivelmente até o dia **${dados.diaVencimento}** de cada mês subsequente ao de competência.
3.3. **Taxa sobre Consultas:** ${clausulaTaxa}
3.4. O atraso no pagamento sujeitará o PROFISSIONAL à multa moratória de 2% (dois por cento) sobre o débito, acrescido de juros de 1% (um por cento) ao mês.

---

### CLÁUSULA QUARTA - DA INFRAESTRUTURA E SERVIÇOS INCLUÍDOS
4.1. Estão inclusos na mensalidade de locação o fornecimento de:
- Consumo padrão de energia elétrica, iluminação e climatização;
- Ponto de rede de internet Wi-Fi de alta velocidade;
- Acesso à sala de espera, sanitários e recepção compartilhada;
- Serviço de acolhimento e check-in eletrônico de pacientes pela recepção física;
- Limpeza padrão e descarte adequado de resíduos de saúde conforme PGRSS.

---

### CLÁUSULA QUINTA - DAS RESPONSABILIDADES DO PROFISSIONAL
5.1. O PROFISSIONAL é o único e exclusivo responsável civil, penal, ético e técnico pelos diagnósticos, tratamentos, prescrições e condutas adotadas com seus pacientes.
5.2. O PROFISSIONAL declara manter sua inscrição ativa e regular perante seu Conselho Profissional, respondendo diretamente por quaisquer infrações éticas ou deontológicas.
5.3. O PROFISSIONAL zelará pela conservação dos móveis, equipamentos e instalações do consultório, indenizando danos causados por dolo ou culpa.

---

### CLÁUSULA SEXTA - DA VIGÊNCIA E RESCISÃO
6.1. O presente contrato entra em vigor a partir de **${dados.dataInicio}**, vigorando **${vigenciaFim}**.
6.2. Qualquer das partes poderá rescindir o presente contrato sem justa causa mediante notificação prévia por escrito com antecedência mínima de **30 (trinta) dias**.
6.3. O encerramento do contrato implicará na imediata desativação da grade semanal de reservas futuras e liberação do consultório.

---

### CLÁUSULA SÉTIMA - DO FORO
7.1. Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da Comarca onde se localiza o estabelecimento da CLÍNICA.

E por estarem justos e acordados, firmam o presente instrumento em 2 (duas) vias de igual teor.

Local e Data: _________________________________, _____ de _________________ de 20____.


_____________________________________________
**${dados.clinicaNome}**
*(Locadora / Administradora)*


_____________________________________________
**${dados.profissionalNome}**
*${registroProfissional}*
*(Locatário / Profissional)*


**TESTEMUNHAS:**

1. __________________________________   2. __________________________________
   Nome:                                   Nome:
   CPF:                                    CPF:
`;
}
