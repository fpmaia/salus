"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { GradeHorariosEditor } from "@/components/grade-horarios-editor";
import { TermosContratoEditor } from "@/components/termos-contrato-editor";
import { criarContratoAcao } from "../actions";
import type { EstadoAcao } from "@/src/server/acao";
import {
  gerarMinutaContratoPadrao,
  type ItemGrade,
} from "@/src/domain/contratos";
import { lerMoeda } from "@/src/domain/dinheiro";

const estadoInicial: EstadoAcao = { erro: null, sucesso: null };

interface FormularioNovoContratoProps {
  clinicaNome: string;
  clinicaDocumento?: string | null;
  salas: Array<{ id: string; nome: string; valorMensalCentavos: number | null }>;
  profissionais: Array<{
    id: string;
    nome: string;
    conselho: string | null;
    registro: string | null;
    especialidade: string | null;
  }>;
}

export function FormularioNovoContrato({
  clinicaNome,
  clinicaDocumento,
  salas,
  profissionais,
}: FormularioNovoContratoProps) {
  const [estado, acao, pendente] = useActionState<EstadoAcao, FormData>(criarContratoAcao, estadoInicial);

  const [profissionalId, setProfissionalId] = useState(profissionais[0]?.id || "");
  const [salaId, setSalaId] = useState(salas[0]?.id || "");
  const [valorMensal, setValorMensal] = useState("1.800,00");
  const [diaVencimento, setDiaVencimento] = useState(10);
  const [dataInicio, setDataInicio] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [dataFim, setDataFim] = useState("");
  const [cobrancaTipo, setCobrancaTipo] = useState<"nenhuma" | "fixo" | "percentual">("nenhuma");
  const [cobrancaValor, setCobrancaValor] = useState("15,00");
  const [cobrancaPercentual, setCobrancaPercentual] = useState("10");

  const [grade, setGrade] = useState<ItemGrade[]>([
    { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
    { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" },
  ]);

  const obterMinutaPreenchida = () => {
    const prof = profissionais.find((p) => p.id === profissionalId);
    const sal = salas.find((s) => s.id === salaId);
    if (!prof || !sal) return null;

    const centavos = lerMoeda(valorMensal) ?? 0;
    const taxaCentavos = cobrancaTipo === "fixo" ? (lerMoeda(cobrancaValor) ?? null) : null;
    const taxaBp = cobrancaTipo === "percentual" ? Math.round(Number(cobrancaPercentual) * 100) : null;

    return gerarMinutaContratoPadrao({
      clinicaNome,
      clinicaDocumento,
      profissionalNome: prof.nome,
      profissionalConselho: prof.conselho,
      profissionalRegistro: prof.registro,
      salaNome: sal.nome,
      valorMensalCentavos: centavos,
      diaVencimento,
      dataInicio,
      dataFim: dataFim || null,
      gradeHorarios: grade,
      cobrancaConsultaTipo: cobrancaTipo,
      cobrancaConsultaValorCentavos: taxaCentavos,
      cobrancaConsultaPercentualBp: taxaBp,
    });
  };

  const minutaInicial = obterMinutaPreenchida() || "";

  return (
    <form action={acao} className="space-y-6">
      {estado.erro && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in">
          {estado.erro}
        </div>
      )}

      {/* 1. Seleção das Partes */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          1. Identificação da Sala e do Profissional Locatário
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Profissional Locatário *
            </label>
            <select
              name="profissionalId"
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{" "}
                  {p.conselho && p.registro ? `(${p.conselho} ${p.registro})` : ""}{" "}
                  {p.especialidade ? `· ${p.especialidade}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Consultório / Sala *
            </label>
            <select
              name="salaId"
              value={salaId}
              onChange={(e) => setSalaId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Condições Financeiras */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
          2. Modelo Financeiro & Mensalidade
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Aluguel Fixo Mensal (R$) *
            </label>
            <input
              type="text"
              name="valorMensal"
              value={valorMensal}
              onChange={(e) => setValorMensal(e.target.value)}
              required
              placeholder="Ex: 1.800,00"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Dia de Vencimento do Aluguel *
            </label>
            <select
              name="diaVencimento"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {[1, 5, 10, 15, 20, 25, 28].map((dia) => (
                <option key={dia} value={dia}>
                  Dia {dia} de cada mês
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Taxa Adicional por Consulta
            </label>
            <select
              name="cobrancaConsultaTipo"
              value={cobrancaTipo}
              onChange={(e) => setCobrancaTipo(e.target.value as "nenhuma" | "fixo" | "percentual")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="nenhuma">Nenhuma (Apenas Aluguel Fixo)</option>
              <option value="fixo">Valor Fixo por Consulta</option>
              <option value="percentual">Percentual sobre a Consulta</option>
            </select>
          </div>
        </div>

        {cobrancaTipo === "fixo" && (
          <div className="sm:w-1/3">
            <label className="text-xs font-medium text-foreground block mb-1">
              Valor por Consulta (R$)
            </label>
            <input
              type="text"
              name="cobrancaConsultaValor"
              value={cobrancaValor}
              onChange={(e) => setCobrancaValor(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        {cobrancaTipo === "percentual" && (
          <div className="sm:w-1/3">
            <label className="text-xs font-medium text-foreground block mb-1">
              Percentual Retido pela Clínica (%)
            </label>
            <input
              type="number"
              name="cobrancaConsultaPercentual"
              value={cobrancaPercentual}
              onChange={(e) => setCobrancaPercentual(e.target.value)}
              min="1"
              max="100"
              step="0.5"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </div>

      {/* 3. Vigência */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="size-4 text-blue-600" />
          3. Vigência do Contrato
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Data de Início da Locação *
            </label>
            <input
              type="date"
              name="dataInicio"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              💡 A agenda desta sala será reservada automaticamente para o profissional a partir desta data.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Data de Término (Opcional - deixe vazio para tempo indeterminado)
            </label>
            <input
              type="date"
              name="dataFim"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* 4. Grade Horária Semanal Recorrente */}
      <GradeHorariosEditor
        valorInicial={grade}
        onChange={(novaGrade) => setGrade(novaGrade)}
      />

      {/* 5. Termos do Contrato Editáveis */}
      <TermosContratoEditor
        valorInicial={minutaInicial}
        aoSolicitarRegerar={obterMinutaPreenchida}
      />

      {/* 6. Observações Internas */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-2">
        <label className="text-xs font-semibold text-foreground block">
          Observações Internas (Opcional)
        </label>
        <textarea
          name="observacoes"
          rows={2}
          className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Anotações para a administração ou recepção sobre este contrato..."
        />
      </div>

      {/* Rodapé com Botões de Ação */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/60">
        <Link
          href="/painel/contratos"
          className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Cancelar
        </Link>

        <button
          type="submit"
          disabled={pendente}
          className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {pendente ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Gerando Contrato & Reservas...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              <span>Salvar e Ativar Contrato com Recorrência</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
