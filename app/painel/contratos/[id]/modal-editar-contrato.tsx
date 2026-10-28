"use client";

import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { InputMascara } from "@/components/input-mascara";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { Acordo } from "@/src/domain/financeiro";
import { editarContratoAcao } from "../actions";

const reais = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
const porcento = (bp: number | null | undefined) => (bp ? String(bp / 100).replace(".", ",") : "");

export function ModalEditarContrato({
  contrato,
}: {
  contrato: Acordo & {
    id: string;
    codigo: string;
    prazoCancelamentoHoras: number;
    observacoes: string | null;
    termos: string | null;
    vigenteDe: string;
    vigenteAte: string | null;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const [regraFalta, setRegraFalta] = useState(contrato.regraFalta);

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        Editar contrato
      </Button>
    );
  }

  return (
    <Card className="border-primary/50 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Editar Contrato {contrato.codigo}</CardTitle>
          <CardDescription>
            Ajuste valores, prazos, observações ou termos desta versão do contrato.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
          ✕ Fechar
        </Button>
      </CardHeader>
      <CardContent>
        <FormAcao
          acao={editarContratoAcao.bind(null, contrato.id)}
          textoBotao="Salvar alterações"
          textoPendente="Salvando alterações…"
          aoConcluir={() => setAberto(false)}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {contrato.modelo === "hora" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorHoraCentavos">Valor da hora (R$)</Label>
                <InputMascara
                  id="valorHoraCentavos"
                  name="valorHoraCentavos"
                  mascara="moeda"
                  required
                  defaultValue={reais(contrato.valorHoraCentavos)}
                />
              </div>
            )}

            {contrato.modelo === "consulta" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorConsultaCentavos">Valor por consulta (R$)</Label>
                <InputMascara
                  id="valorConsultaCentavos"
                  name="valorConsultaCentavos"
                  mascara="moeda"
                  required
                  defaultValue={reais(contrato.valorConsultaCentavos)}
                />
              </div>
            )}

            {contrato.modelo === "percentual" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="percentualBp">Percentual (%)</Label>
                <Input
                  id="percentualBp"
                  name="percentualBp"
                  inputMode="decimal"
                  required
                  defaultValue={porcento(contrato.percentualBp)}
                />
              </div>
            )}

            {contrato.modelo === "mensalidade" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mensalidadeCentavos">Mensalidade (R$)</Label>
                  <InputMascara
                    id="mensalidadeCentavos"
                    name="mensalidadeCentavos"
                    mascara="moeda"
                    required
                    defaultValue={reais(contrato.mensalidadeCentavos)}
                  />
                </div>
                {contrato.horasIncluidas !== null ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="horasIncluidas">Horas incluídas no mês</Label>
                      <Input
                        id="horasIncluidas"
                        name="horasIncluidas"
                        type="number"
                        min={0}
                        defaultValue={contrato.horasIncluidas}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="valorHoraCentavos">Hora além do pacote (R$)</Label>
                      <InputMascara
                        id="valorHoraCentavos"
                        name="valorHoraCentavos"
                        mascara="moeda"
                        defaultValue={reais(contrato.valorHoraCentavos)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="valorHoraCentavos">Hora fora do turno/grade (R$)</Label>
                      <InputMascara
                        id="valorHoraCentavos"
                        name="valorHoraCentavos"
                        mascara="moeda"
                        defaultValue={reais(contrato.valorHoraCentavos)}
                      />
                    </div>
                    {contrato.valorConsultaCentavos ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="valorConsultaCentavos">Valor por consulta (R$)</Label>
                        <InputMascara
                          id="valorConsultaCentavos"
                          name="valorConsultaCentavos"
                          mascara="moeda"
                          defaultValue={reais(contrato.valorConsultaCentavos)}
                        />
                      </div>
                    ) : null}
                    {contrato.percentualBp ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="percentualBp">Percentual por consulta (%)</Label>
                        <Input
                          id="percentualBp"
                          name="percentualBp"
                          inputMode="decimal"
                          defaultValue={porcento(contrato.percentualBp)}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="vigenteAte">Término de vigência (opcional)</Label>
              <Input
                id="vigenteAte"
                name="vigenteAte"
                type="date"
                min={contrato.vigenteDe}
                defaultValue={contrato.vigenteAte ?? ""}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prazoCancelamentoHoras">Prazo cancelamento (horas antes)</Label>
              <Input
                id="prazoCancelamentoHoras"
                name="prazoCancelamentoHoras"
                type="number"
                min={0}
                max={720}
                defaultValue={contrato.prazoCancelamentoHoras}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="regraFalta">Regra na falta do paciente</Label>
              <NativeSelect
                id="regraFalta"
                name="regraFalta"
                value={regraFalta}
                onChange={(e) => setRegraFalta(e.target.value as never)}
              >
                <option value="isenta">Não cobra</option>
                <option value="integral">Cobra integral</option>
                <option value="percentual">Cobra percentual</option>
              </NativeSelect>
            </div>

            {regraFalta === "percentual" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="faltaPercentualBp">Percentual na falta (%)</Label>
                <Input
                  id="faltaPercentualBp"
                  name="faltaPercentualBp"
                  inputMode="decimal"
                  defaultValue={porcento(contrato.faltaPercentualBp)}
                />
              </div>
            )}

            {contrato.modelo === "hora" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="multaCancelamentoReservaBp">Multa cancelamento turno (%)</Label>
                <Input
                  id="multaCancelamentoReservaBp"
                  name="multaCancelamentoReservaBp"
                  inputMode="decimal"
                  defaultValue={porcento(contrato.multaCancelamentoReservaBp)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="observacoes">Observações internas</Label>
            <Input
              id="observacoes"
              name="observacoes"
              maxLength={1000}
              defaultValue={contrato.observacoes ?? ""}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="termos">Termos contratuais</Label>
            <textarea
              id="termos"
              name="termos"
              rows={5}
              className="w-full rounded-md border bg-transparent p-2 text-xs font-mono"
              defaultValue={contrato.termos ?? ""}
            />
          </div>
        </FormAcao>
      </CardContent>
    </Card>
  );
}
