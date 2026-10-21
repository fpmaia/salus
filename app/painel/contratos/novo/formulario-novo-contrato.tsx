"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { GradeHorariosEditor } from "@/components/grade-horarios-editor";
import { TermosContratoEditor } from "@/components/termos-contrato-editor";
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
  const [f, setF] = useState({
    modelo: (v?.modelo === "sala_fixa" ? "mensalidade" : v?.modelo) ?? "hora",
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

  return (
    <FormAcao acao={criarContratoAcao} textoBotao={atual ? "Salvar nova versão" : "Criar contrato"} textoPendente="Salvando…" className="flex flex-col gap-6">
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
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

      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Campo id="modelo" rotulo="Como cobra a sala">
          <NativeSelect id="modelo" name="modelo" value={f.modelo} onChange={muda("modelo")}>
            <option value="hora">Por hora reservada</option>
            <option value="consulta">Valor fixo por consulta</option>
            <option value="percentual">Percentual do atendimento</option>
            <option value="mensalidade">Mensalidade (pacote de horas ou turno fixo)</option>
          </NativeSelect>
        </Campo>
        {f.modelo === "hora" && (
          <Campo id="valorHora" rotulo="Valor da hora (R$)">
            <Input id="valorHora" name="valorHora" inputMode="decimal" required placeholder="45,00" value={f.valorHora} onChange={muda("valorHora")} />
          </Campo>
        )}
        {f.modelo === "consulta" && (
          <Campo id="valorConsulta" rotulo="Valor por consulta (R$)">
            <Input id="valorConsulta" name="valorConsulta" inputMode="decimal" required placeholder="30,00" value={f.valorConsulta} onChange={muda("valorConsulta")} />
          </Campo>
        )}
        {f.modelo === "percentual" && (
          <Campo id="percentual" rotulo="Percentual (%)" dica="Sobre o valor de cada atendimento realizado.">
            <Input id="percentual" name="percentual" inputMode="decimal" required placeholder="30" value={f.percentual} onChange={muda("percentual")} />
          </Campo>
        )}
        {f.modelo === "mensalidade" && (
          <>
            <Campo id="mensalidade" rotulo="Mensalidade (R$)">
              <Input id="mensalidade" name="mensalidade" inputMode="decimal" required placeholder="1.800,00" value={f.mensalidade} onChange={muda("mensalidade")} />
            </Campo>
            <Campo id="varianteMensalidade" rotulo="O que a mensalidade cobre">
              <NativeSelect id="varianteMensalidade" name="varianteMensalidade" value={f.variante} onChange={muda("variante")}>
                <option value="turno">Turno fixo / sala dedicada (sem limite de horas)</option>
                <option value="pacote">Pacote de horas no mês</option>
              </NativeSelect>
            </Campo>
            {f.variante === "pacote" ? (
              <>
                <Campo id="horasIncluidas" rotulo="Horas incluídas no mês">
                  <Input id="horasIncluidas" name="horasIncluidas" type="number" min={0} required value={f.horasIncluidas} onChange={muda("horasIncluidas")} />
                </Campo>
                <Campo id="valorHoraExtra" rotulo="Hora além do pacote (R$)">
                  <Input id="valorHoraExtra" name="valorHoraExtra" inputMode="decimal" placeholder="40,00" value={f.valorHoraExtra} onChange={muda("valorHoraExtra")} />
                </Campo>
              </>
            ) : (
              <>
                <Campo id="valorHoraExtra" rotulo="Hora fora do turno fixo (R$)" dica="Reservas avulsas fora da grade. Vazio: não cobra.">
                  <Input id="valorHoraExtra" name="valorHoraExtra" inputMode="decimal" placeholder="40,00" value={f.valorHoraExtra} onChange={muda("valorHoraExtra")} />
                </Campo>
                <Campo id="cobrancaPorAtendimento" rotulo="Cobrar também por atendimento">
                  <NativeSelect id="cobrancaPorAtendimento" name="cobrancaPorAtendimento" value={f.porAtendimento} onChange={muda("porAtendimento")}>
                    <option value="nenhuma">Não</option>
                    <option value="consulta">Valor fixo por consulta</option>
                    <option value="percentual">Percentual do atendimento</option>
                  </NativeSelect>
                </Campo>
                {f.porAtendimento === "consulta" && (
                  <Campo id="valorPorAtendimento" rotulo="Valor por consulta (R$)">
                    <Input id="valorPorAtendimento" name="valorPorAtendimento" inputMode="decimal" required value={f.valorPorAtendimento} onChange={muda("valorPorAtendimento")} />
                  </Campo>
                )}
                {f.porAtendimento === "percentual" && (
                  <Campo id="percentualPorAtendimento" rotulo="Percentual por atendimento (%)">
                    <Input id="percentualPorAtendimento" name="percentualPorAtendimento" inputMode="decimal" required value={f.percentualPorAtendimento} onChange={muda("percentualPorAtendimento")} />
                  </Campo>
                )}
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
