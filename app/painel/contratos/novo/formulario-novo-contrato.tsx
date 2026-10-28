"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { GradeHorariosEditor } from "@/components/grade-horarios-editor";
import { TermosContratoEditor } from "@/components/termos-contrato-editor";
import { InputMascara } from "@/components/input-mascara";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { descreverCondicoes, gerarMinutaContratoPadrao, type ItemGrade } from "@/src/domain/contratos";
import { lerMoeda, lerPercentualBp } from "@/src/domain/dinheiro";
import type { Acordo } from "@/src/domain/financeiro";
import { criarContratoAcao } from "../actions";

type Opcao = { id: string; nome: string };
type Profissional = Opcao & { conselho: string | null; registro: string | null };
export type ContratoAtual = {
  codigo: string;
  valores: Acordo & { prazoCancelamentoHoras: number; observacoes: string | null };
  grade: { salaId: string; diaSemana: number; horaInicio: string; horaFim: string }[];
};

const reais = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
const porcento = (bp: number | null | undefined) => (bp ? String(bp / 100).replace(".", ",") : "");

function Campo({ id, rotulo, children, dica }: { id: string; rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function FormularioNovoContrato({
  profissionais,
  salas,
  profissionalInicial,
  atual,
  prazoPadrao,
  hoje,
  espaco,
}: {
  profissionais: Profissional[];
  salas: Opcao[];
  profissionalInicial: string;
  atual: ContratoAtual | null;
  prazoPadrao: number;
  hoje: string;
  espaco: { nome: string; documento: string | null };
}) {
  const router = useRouter();
  const v = atual?.valores;
  const modalidadeInicial =
    v && v.modelo === "mensalidade"
      ? v.horasIncluidas !== null
        ? "pacote"
        : v.valorConsultaCentavos
          ? "fixa_consulta"
          : v.percentualBp
            ? "fixa_percentual"
            : "fixa"
      : "fixa";

  const [f, setF] = useState({
    modelo: (v?.modelo === "sala_fixa" ? "mensalidade" : v?.modelo) ?? "hora",
    modalidadeMensal: modalidadeInicial,
    variante: v && v.modelo === "mensalidade" && v.horasIncluidas !== null ? "pacote" : "turno",
    valorHora: reais(v?.modelo === "hora" ? v.valorHoraCentavos : null),
    valorHoraExtra: reais(v?.modelo === "mensalidade" ? v.valorHoraCentavos : null),
    valorConsulta: reais(v?.modelo === "consulta" ? v.valorConsultaCentavos : null),
    percentual: porcento(v?.modelo === "percentual" ? v.percentualBp : null),
    mensalidade: reais(v?.mensalidadeCentavos),
    horasIncluidas: v?.horasIncluidas != null ? String(v.horasIncluidas) : "",
    porAtendimento: v?.modelo === "mensalidade" && v.valorConsultaCentavos ? "consulta" : v?.modelo === "mensalidade" && v.percentualBp ? "percentual" : "nenhuma",
    valorPorAtendimento: reais(v?.modelo === "mensalidade" ? v.valorConsultaCentavos : null),
    percentualPorAtendimento: porcento(v?.modelo === "mensalidade" ? v.percentualBp : null),
    fluxo: v?.fluxoRecebimento ?? "direto",
    regraFalta: v?.regraFalta ?? "isenta",
    faltaPercentual: porcento(v?.faltaPercentualBp),
    prazo: String(v?.prazoCancelamentoHoras ?? prazoPadrao),
    multa: porcento(v?.multaCancelamentoReservaBp),
    vigenteDe: hoje,
    vigenteAte: "",
    gradeAcao: atual?.grade.length ? "manter" : "nenhuma",
    gradeSalaId: atual?.grade[0]?.salaId ?? salas[0]?.id ?? "",
  });
  const [grade, setGrade] = useState<ItemGrade[]>(
    atual?.grade.map((g) => ({ diaSemana: g.diaSemana, horaInicio: g.horaInicio, horaFim: g.horaFim })) ?? [],
  );
  const muda = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [campo]: e.target.value });

  const mudaModalidadeMensal = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mod = e.target.value;
    const variante = mod === "pacote" ? "pacote" : "turno";
    const porAtendimento = mod === "fixa_consulta" ? "consulta" : mod === "fixa_percentual" ? "percentual" : "nenhuma";
    setF({ ...f, modalidadeMensal: mod, variante, porAtendimento });
  };

  const profissional = profissionais.find((p) => p.id === profissionalInicial) ?? profissionais[0];
  const comGradeNova = f.gradeAcao === "criar" || f.gradeAcao === "trocar";
  const comGrade = comGradeNova || f.gradeAcao === "manter";

  // Minuta gerada a partir do que está no formulário (o texto pode ser editado antes de salvar).
  const minuta = useMemo(() => {
    const mensal = f.modelo === "mensalidade";
    const condicoes = descreverCondicoes({
      modelo: f.modelo as Acordo["modelo"],
      fluxoRecebimento: f.fluxo as Acordo["fluxoRecebimento"],
      valorHoraCentavos: lerMoeda(mensal ? f.valorHoraExtra : f.valorHora),
      valorConsultaCentavos: lerMoeda(f.modelo === "consulta" ? f.valorConsulta : f.porAtendimento === "consulta" ? f.valorPorAtendimento : ""),
      percentualBp: lerPercentualBp(f.modelo === "percentual" ? f.percentual : f.porAtendimento === "percentual" ? f.percentualPorAtendimento : ""),
      mensalidadeCentavos: mensal ? lerMoeda(f.mensalidade) : null,
      horasIncluidas: mensal && f.variante === "pacote" ? Number(f.horasIncluidas || 0) : null,
      regraFalta: f.regraFalta as Acordo["regraFalta"],
      faltaPercentualBp: lerPercentualBp(f.faltaPercentual),
      prazoCancelamentoHoras: Number(f.prazo || 0),
      multaCancelamentoReservaBp: f.modelo === "hora" && comGrade ? lerPercentualBp(f.multa) : null,
    });
    const itens = comGradeNova ? grade : f.gradeAcao === "manter" ? (atual?.grade ?? []) : [];
    return gerarMinutaContratoPadrao({
      clinicaNome: espaco.nome,
      clinicaDocumento: espaco.documento,
      profissionalNome: profissional.nome,
      profissionalConselho: profissional.conselho,
      profissionalRegistro: profissional.registro,
      codigo: "(gerado ao salvar)",
      salaNome: comGrade ? (salas.find((s) => s.id === (comGradeNova ? f.gradeSalaId : atual?.grade[0]?.salaId))?.nome ?? null) : null,
      condicoes,
      dataInicio: f.vigenteDe,
      dataFim: f.vigenteAte || null,
      gradeHorarios: itens,
    });
  }, [f, grade, comGrade, comGradeNova, profissional, espaco, salas, atual]);

  const explicacaoHumana = useMemo(() => {
    const nome = profissional?.nome || "O profissional";
    const modelo = f.modelo;
    const mensal = modelo === "mensalidade";
    const fluxo =
      f.fluxo === "centralizado"
        ? "A clínica centraliza os pagamentos dos pacientes e repassa o líquido ao profissional."
        : "O próprio profissional recebe o valor diretamente do paciente.";
    const cancelamento =
      Number(f.prazo) > 0
        ? `Cancelamentos sem custo com até ${f.prazo}h de antecedência.`
        : "Sem prazo de cancelamento antecipado.";

    let principal = "";
    if (modelo === "hora") {
      principal = `${nome} pagará R$ ${f.valorHora || "0,00"} por hora de sala reservada.`;
      if (comGrade && grade.length > 0) {
        principal += ` Com grade fixa reservada toda semana.`;
      }
    } else if (modelo === "consulta") {
      principal = `${nome} pagará R$ ${f.valorConsulta || "0,00"} para a clínica a cada consulta/atendimento realizado.`;
    } else if (modelo === "percentual") {
      principal = `A clínica receberá ${f.percentual || "0"}% sobre o valor cobrado de cada atendimento realizado por ${nome}.`;
    } else if (mensal) {
      if (f.modalidadeMensal === "fixa") {
        principal = `${nome} pagará uma mensalidade fixa de R$ ${f.mensalidade || "0,00"} por mês.`;
        if (f.valorHoraExtra) {
          principal += ` Horas reservadas fora da grade fixa custarão R$ ${f.valorHoraExtra}/hora.`;
        }
      } else if (f.modalidadeMensal === "fixa_percentual") {
        principal = `${nome} pagará R$ ${f.mensalidade || "0,00"} por mês MAIS ${f.percentualPorAtendimento || "0"}% de taxa sobre cada consulta realizada.`;
        if (f.valorHoraExtra) {
          principal += ` Horas avulsas fora da grade: R$ ${f.valorHoraExtra}/h.`;
        }
      } else if (f.modalidadeMensal === "fixa_consulta") {
        principal = `${nome} pagará R$ ${f.mensalidade || "0,00"} por mês MAIS R$ ${f.valorPorAtendimento || "0,00"} por cada consulta realizada.`;
        if (f.valorHoraExtra) {
          principal += ` Horas avulsas fora da grade: R$ ${f.valorHoraExtra}/h.`;
        }
      } else if (f.modalidadeMensal === "pacote") {
        principal = `${nome} terá um pacote mensal de R$ ${f.mensalidade || "0,00"} com franquia de ${f.horasIncluidas || "0"} horas incluídas.`;
        if (f.valorHoraExtra) {
          principal += ` Horas adicionais excedentes ao pacote: R$ ${f.valorHoraExtra}/hora.`;
        }
      }
    }

    let falta = "";
    if (f.regraFalta === "isenta") {
      falta = "Em caso de falta do paciente, o profissional fica isento da taxa do espaço.";
    } else if (f.regraFalta === "integral") {
      falta = "Em caso de falta do paciente, a taxa do espaço é cobrada integralmente.";
    } else if (f.regraFalta === "percentual") {
      falta = `Em caso de falta do paciente, cobra-se ${f.faltaPercentual || "0"}% do valor do espaço.`;
    }

    return { principal, fluxo, cancelamento, falta };
  }, [f, profissional, comGrade, grade]);

  return (
    <FormAcao acao={criarContratoAcao} textoBotao={atual ? "Salvar nova versão" : "Criar contrato"} textoPendente="Salvando…" className="flex flex-col gap-6">
      <input type="hidden" name="varianteMensalidade" value={f.variante} />
      <input type="hidden" name="cobrancaPorAtendimento" value={f.porAtendimento} />
      <input type="hidden" name="modelo" value={f.modelo} />

      {/* Caixa de Simulação em Linguagem Humana em Tempo Real */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm shadow-xs transition-all">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">💡</span>
          <span>Como este contrato funcionará na prática</span>
        </div>
        <p className="mt-2 font-medium text-foreground text-sm sm:text-base leading-relaxed">
          {explicacaoHumana.principal}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground border-t border-primary/15 pt-2.5">
          <span>• {explicacaoHumana.fluxo}</span>
          <span>• {explicacaoHumana.cancelamento}</span>
          <span>• {explicacaoHumana.falta}</span>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3 bg-card shadow-2xs">
        <Campo id="profissionalId" rotulo="Profissional">
          <NativeSelect
            id="profissionalId"
            name="profissionalId"
            defaultValue={profissional.id}
            onChange={(e) => router.replace(`/painel/contratos/novo?profissional=${e.target.value}`)}
          >
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <Campo id="vigenteDe" rotulo="Vale a partir de">
          <Input id="vigenteDe" name="vigenteDe" type="date" required value={f.vigenteDe} onChange={muda("vigenteDe")} />
        </Campo>
        <Campo id="vigenteAte" rotulo="Até (opcional)">
          <Input id="vigenteAte" name="vigenteAte" type="date" min={f.vigenteDe} value={f.vigenteAte} onChange={muda("vigenteAte")} />
        </Campo>
      </section>

      {/* Seleção Visual de Modelo de Cobrança com Cards */}
      <section className="flex flex-col gap-3 rounded-xl border p-4 bg-card shadow-2xs">
        <div>
          <Label className="text-sm font-semibold">Escolha o Modelo de Cobrança</Label>
          <p className="text-xs text-muted-foreground">Clique na opção que melhor descreve a relação comercial com este profissional:</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          {[
            {
              id: "hora" as const,
              titulo: "Por Hora Avulsa",
              desc: "Paga apenas pelo tempo de sala reservado na agenda.",
              emoji: "🕒",
            },
            {
              id: "consulta" as const,
              titulo: "Fixo por Consulta",
              desc: "Paga um valor tabelado a cada atendimento feito.",
              emoji: "🩺",
            },
            {
              id: "percentual" as const,
              titulo: "Percentual (%)",
              desc: "Repassa % sobre o valor cobrado do paciente.",
              emoji: "📊",
            },
            {
              id: "mensalidade" as const,
              titulo: "Plano Mensal",
              desc: "Mensalidade fixa, pacote de horas ou plano misto.",
              emoji: "🏢",
            },
          ].map((m) => {
            const ativo = f.modelo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setF({ ...f, modelo: m.id })}
                className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                  ativo
                    ? "border-primary bg-primary/10 shadow-xs ring-2 ring-primary/30"
                    : "border-border/70 hover:border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xl">{m.emoji}</span>
                  {ativo && <span className="text-[10px] font-bold rounded-full bg-primary text-primary-foreground px-2 py-0.5">Ativo</span>}
                </div>
                <span className="mt-2 font-semibold text-sm text-foreground">{m.titulo}</span>
                <span className="mt-1 text-xs text-muted-foreground leading-snug">{m.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Campos específicos do Modelo Escolhido */}
        <div className="mt-3 pt-3 border-t grid gap-4 sm:grid-cols-3">
          {f.modelo === "hora" && (
            <Campo id="valorHora" rotulo="Valor da hora (R$)" dica="Cobrado a cada hora de sala alugada.">
              <InputMascara id="valorHora" name="valorHora" mascara="moeda" required placeholder="45,00" value={f.valorHora} onChange={muda("valorHora")} />
            </Campo>
          )}
          {f.modelo === "consulta" && (
            <Campo id="valorConsulta" rotulo="Valor por consulta (R$)" dica="Cobrado a cada consulta atendida.">
              <InputMascara id="valorConsulta" name="valorConsulta" mascara="moeda" required placeholder="30,00" value={f.valorConsulta} onChange={muda("valorConsulta")} />
            </Campo>
          )}
          {f.modelo === "percentual" && (
            <Campo id="percentual" rotulo="Percentual (%)" dica="Sobre o valor de cada atendimento realizado.">
              <Input id="percentual" name="percentual" inputMode="decimal" required placeholder="30" value={f.percentual} onChange={muda("percentual")} />
            </Campo>
          )}
          {f.modelo === "mensalidade" && (
            <>
              <Campo id="modalidadeMensal" rotulo="Tipo do plano mensal">
                <NativeSelect id="modalidadeMensal" value={f.modalidadeMensal} onChange={mudaModalidadeMensal}>
                  <option value="fixa">Apenas mensalidade fixa</option>
                  <option value="fixa_percentual">Mensalidade + Percentual por consulta</option>
                  <option value="fixa_consulta">Mensalidade + Valor fixo por consulta</option>
                  <option value="pacote">Mensalidade com pacote de horas</option>
                </NativeSelect>
              </Campo>

              <Campo id="mensalidade" rotulo="Valor da mensalidade (R$)">
                <InputMascara id="mensalidade" name="mensalidade" mascara="moeda" required placeholder="1.800,00" value={f.mensalidade} onChange={muda("mensalidade")} />
              </Campo>

              {f.modalidadeMensal === "pacote" ? (
                <>
                  <Campo id="horasIncluidas" rotulo="Horas incluídas no mês">
                    <Input id="horasIncluidas" name="horasIncluidas" type="number" min={0} required value={f.horasIncluidas} onChange={muda("horasIncluidas")} />
                  </Campo>
                  <Campo id="valorHoraExtra" rotulo="Hora além do pacote (R$)">
                    <InputMascara id="valorHoraExtra" name="valorHoraExtra" mascara="moeda" placeholder="40,00" value={f.valorHoraExtra} onChange={muda("valorHoraExtra")} />
                  </Campo>
                </>
              ) : (
                <>
                  {f.modalidadeMensal === "fixa_consulta" && (
                    <Campo id="valorPorAtendimento" rotulo="Valor por consulta realizada (R$)">
                      <InputMascara id="valorPorAtendimento" name="valorPorAtendimento" mascara="moeda" required value={f.valorPorAtendimento} onChange={muda("valorPorAtendimento")} />
                    </Campo>
                  )}
                  {f.modalidadeMensal === "fixa_percentual" && (
                    <Campo id="percentualPorAtendimento" rotulo="Percentual por atendimento (%)">
                      <Input id="percentualPorAtendimento" name="percentualPorAtendimento" inputMode="decimal" required placeholder="20" value={f.percentualPorAtendimento} onChange={muda("percentualPorAtendimento")} />
                    </Campo>
                  )}
                  <Campo id="valorHoraExtra" rotulo="Hora fora da grade/turno (R$)" dica="Reservas avulsas fora dos horários fixos. Vazio: não cobra hora extra.">
                    <InputMascara id="valorHoraExtra" name="valorHoraExtra" mascara="moeda" placeholder="40,00" value={f.valorHoraExtra} onChange={muda("valorHoraExtra")} />
                  </Campo>
                </>
              )}
            </>
          )}
          <Campo id="fluxoRecebimento" rotulo="Quem recebe do paciente">
            <NativeSelect id="fluxoRecebimento" name="fluxoRecebimento" value={f.fluxo} onChange={muda("fluxo")}>
              <option value="direto">O próprio profissional</option>
              <option value="centralizado">O espaço (e repassa ao profissional)</option>
            </NativeSelect>
          </Campo>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Campo id="prazoCancelamentoHoras" rotulo="Cancelar sem custo até (horas antes)" dica="Vale para consultas e reservas deste contrato.">
          <Input id="prazoCancelamentoHoras" name="prazoCancelamentoHoras" type="number" min={0} max={720} required value={f.prazo} onChange={muda("prazo")} />
        </Campo>
        <Campo id="regraFalta" rotulo="Falta ou cancelamento tardio do paciente">
          <NativeSelect id="regraFalta" name="regraFalta" value={f.regraFalta} onChange={muda("regraFalta")}>
            <option value="isenta">Não cobra</option>
            <option value="integral">Cobra o valor integral</option>
            <option value="percentual">Cobra um percentual</option>
          </NativeSelect>
        </Campo>
        {f.regraFalta === "percentual" && (
          <Campo id="faltaPercentual" rotulo="Percentual na falta (%)">
            <Input id="faltaPercentual" name="faltaPercentual" inputMode="decimal" required value={f.faltaPercentual} onChange={muda("faltaPercentual")} />
          </Campo>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <Campo id="gradeAcao" rotulo="Grade fixa semanal">
          <NativeSelect id="gradeAcao" name="gradeAcao" value={f.gradeAcao} onChange={muda("gradeAcao")} className="max-w-md">
            {atual?.grade.length ? (
              <>
                <option value="manter">Manter a grade atual</option>
                <option value="trocar">Trocar a grade</option>
                <option value="remover">Remover a grade</option>
              </>
            ) : (
              <>
                <option value="nenhuma">Sem grade fixa (reservas avulsas)</option>
                <option value="criar">Com grade fixa</option>
              </>
            )}
          </NativeSelect>
        </Campo>
        {comGradeNova && (
          <>
            <Campo id="gradeSalaId" rotulo="Sala da grade">
              <NativeSelect id="gradeSalaId" name="gradeSalaId" value={f.gradeSalaId} onChange={muda("gradeSalaId")} className="max-w-md">
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            <GradeHorariosEditor valorInicial={grade} onChange={setGrade} />
          </>
        )}
        {f.modelo === "hora" && comGrade && (
          <Campo
            id="multaTurnoFixo"
            rotulo="Multa ao cancelar uma data da grade depois do prazo (% das horas)"
            dica="Só quando o profissional cancela. Vazio: sem multa."
          >
            <Input id="multaTurnoFixo" name="multaTurnoFixo" inputMode="decimal" placeholder="100" className="max-w-xs" value={f.multa} onChange={muda("multa")} />
          </Campo>
        )}
      </section>

      <TermosContratoEditor valorInicial={minuta} nomeCampo="termos" />

      <Campo id="observacoes" rotulo="Observações internas (opcional)">
        <Input id="observacoes" name="observacoes" maxLength={1000} defaultValue={atual?.valores.observacoes ?? ""} />
      </Campo>
    </FormAcao>
  );
}
