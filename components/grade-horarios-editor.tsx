"use client";

import { useState } from "react";
import { Plus, Trash2, Clock, Calendar } from "lucide-react";
import { DIAS_SEMANA_NOMES, type ItemGrade } from "@/src/domain/contratos";

interface GradeHorariosEditorProps {
  valorInicial?: ItemGrade[];
  nomeCampo?: string;
  onChange?: (grade: ItemGrade[]) => void;
}

export function GradeHorariosEditor({
  valorInicial = [
    { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" },
    { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" },
  ],
  nomeCampo = "gradeHorariosJson",
  onChange,
}: GradeHorariosEditorProps) {
  const [grade, setGrade] = useState<ItemGrade[]>(valorInicial);
  const [diaSemana, setDiaSemana] = useState<number>(1);
  const [horaInicio, setHoraInicio] = useState<string>("08:00");
  const [horaFim, setHoraFim] = useState<string>("12:00");
  const [erro, setErro] = useState<string | null>(null);

  const atualizarGrade = (novaGrade: ItemGrade[]) => {
    setGrade(novaGrade);
    onChange?.(novaGrade);
  };

  const handleAdicionar = () => {
    setErro(null);
    if (!horaInicio || !horaFim) {
      setErro("Informe os horários de início e término");
      return;
    }
    if (horaFim <= horaInicio) {
      setErro("O horário de término deve ser posterior ao horário de início");
      return;
    }

    // Checar sobreposição no mesmo dia
    const sobreposicao = grade.some(
      (item) =>
        item.diaSemana === diaSemana &&
        horaInicio < item.horaFim &&
        item.horaInicio < horaFim
    );

    if (sobreposicao) {
      setErro(`Já existe um horário conflitante para ${DIAS_SEMANA_NOMES[diaSemana]}`);
      return;
    }

    const novaGrade = [...grade, { diaSemana, horaInicio, horaFim }].sort((a, b) => {
      if (a.diaSemana !== b.diaSemana) return a.diaSemana - b.diaSemana;
      return a.horaInicio.localeCompare(b.horaInicio);
    });

    atualizarGrade(novaGrade);
  };

  const handleRemover = (index: number) => {
    const novaGrade = grade.filter((_, i) => i !== index);
    atualizarGrade(novaGrade);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
      <input type="hidden" name={nomeCampo} value={JSON.stringify(grade)} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h4 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Grade Semanal de Horários Fixos
          </h4>
          <p className="text-xs text-muted-foreground">
            Defina os dias e intervalos semanais que ficarão reservados na agenda para o profissional
          </p>
        </div>

        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {grade.length} {grade.length === 1 ? "faixa semanal" : "faixas semanais"}
        </span>
      </div>

      {/* Formulário para adicionar nova faixa */}
      <div className="grid gap-3 sm:grid-cols-4 rounded-xl border border-border/60 bg-background p-3 shadow-xs">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Dia da Semana
          </label>
          <select
            value={diaSemana}
            onChange={(e) => setDiaSemana(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {DIAS_SEMANA_NOMES.map((nome, idx) => (
              <option key={idx} value={idx}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Hora de Início
          </label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Hora de Término
          </label>
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={handleAdicionar}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>
      </div>

      {erro && (
        <p className="text-xs font-medium text-destructive animate-in fade-in">
          {erro}
        </p>
      )}

      {/* Lista de faixas da grade */}
      {grade.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
          Nenhum horário adicionado na grade. Adicione acima os dias em que o profissional ocupará o consultório.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {grade.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-3 py-2 text-xs shadow-xs"
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Clock className="size-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-foreground">
                    {DIAS_SEMANA_NOMES[item.diaSemana]}
                  </span>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {item.horaInicio} às {item.horaFim}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemover(idx)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Remover horário"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
