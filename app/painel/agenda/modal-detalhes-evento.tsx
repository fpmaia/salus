"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, MapPin, User, X, DollarSign, FileText } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { InputMascara } from "@/components/input-mascara";
import { ROTULOS_STATUS, transicoesPossiveis, type StatusAgendamento } from "@/src/domain/agendamentos";
import { formatarDataBr } from "@/src/domain/tempo";
import { alterarStatusAcao, remarcarAcao, desfazerStatusAcao } from "../atendimentos/actions";
import { definirValorAcao } from "../financeiro/actions";
import { cancelarReservaAcao } from "./actions";
import type { DadosSlotAbertura } from "./modal-agendamento";

export type DadosEventoDetalhe = {
  tipo: "atendimento" | "reserva_vaga";
  salaId: string;
  salaNome: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  profissionalNome?: string | null;
  profissionalId?: string | null;
  // Campos específicos de atendimento
  atendimento?: {
    id: string;
    pacienteId: string;
    pacienteNome: string;
    pacienteTelefone?: string | null;
    status: StatusAgendamento;
    statusAnterior?: StatusAgendamento | null;
    valorCentavos?: number | null;
    observacao?: string | null;
    remarcadoEm?: Date | null;
    cancelamentoTardio?: boolean;
    origem?: string;
  };
  // Campos específicos de reserva
  reserva?: {
    id: string;
    ehSalaFixa?: boolean;
    contratoCodigo?: string | null;
    contratoId?: string | null;
    recorrenciaId?: string | null;
    status: "ativa" | "concluida" | "cancelada";
  };
};

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  dados: DadosEventoDetalhe | null;
  gerencia: boolean;
  podeProntuario: boolean;
  salas: { id: string; nome: string }[];
  slotMinutos: number;
  aoAbrirAgendamentoPaciente?: (slot: DadosSlotAbertura) => void;
};

const COR_STATUS: Record<StatusAgendamento, string> = {
  agendado: "bg-muted text-foreground border-border/80",
  confirmado: "bg-primary/15 text-primary border-primary/30 font-semibold",
  presente: "bg-warning/20 text-warning border-warning/40 font-bold",
  realizado: "bg-success/20 text-success border-success/40 font-semibold",
  falta: "bg-destructive/15 text-destructive border-destructive/30 font-semibold",
  cancelado: "bg-muted text-muted-foreground line-through border-border/40",
};

export function ModalDetalhesEvento({
  aberto,
  aoFechar,
  dados,
  gerencia,
  podeProntuario,
  salas,
  slotMinutos,
  aoAbrirAgendamentoPaciente,
}: Props) {
  const router = useRouter();
  const [remarcando, setRemarcando] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    if (aberto) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aberto, aoFechar]);

  if (!aberto || !dados) return null;

  const aoConcluirAcao = () => {
    aoFechar();
    router.refresh();
  };

  const ehAtendimento = dados.tipo === "atendimento" && dados.atendimento;
  const at = dados.atendimento;
  const res = dados.reserva;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal-detalhes"
        className="w-full max-w-lg rounded-2xl border border-border/80 bg-background shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex size-9 items-center justify-center rounded-xl ${
                ehAtendimento ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning"
              }`}
            >
              {ehAtendimento ? <User className="size-5" /> : <Clock className="size-5" />}
            </div>
            <div>
              <h2 id="titulo-modal-detalhes" className="font-heading text-lg font-bold tracking-tight text-foreground">
                {ehAtendimento ? "Detalhes da Consulta" : "Turno Reservado"}
              </h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 text-muted-foreground" />
                  {dados.salaNome}
                </span>
                <span>•</span>
                <span>{formatarDataBr(dados.data)}</span>
                <span>•</span>
                <span className="font-semibold text-foreground">
                  {dados.horaInicio} – {dados.horaFim}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {ehAtendimento && at ? (
            <>
              {/* Cartão do Paciente */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Paciente
                    </span>
                    <h3 className="text-base font-bold text-foreground">
                      {at.pacienteNome}
                    </h3>
                    {at.pacienteTelefone && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        📞 {at.pacienteTelefone}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-md border px-2.5 py-1 text-xs inline-flex items-center gap-1.5 ${
                      COR_STATUS[at.status]
                    }`}
                  >
                    {at.status === "presente" && (
                      <span className="size-1.5 rounded-full bg-warning animate-pulse" />
                    )}
                    {ROTULOS_STATUS[at.status]}
                  </span>
                </div>

                {at.observacao && (
                  <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground italic">
                    Obs.: {at.observacao}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
                  <span className="text-muted-foreground">
                    Profissional: <strong>{dados.profissionalNome ?? "Não informado"}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    {podeProntuario && (
                      <Link
                        href={`/painel/prontuario/${at.pacienteId}`}
                        className="font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        <FileText className="size-3.5" />
                        Prontuário
                      </Link>
                    )}
                    {at.status === "realizado" && typeof at.valorCentavos === "number" && at.valorCentavos > 0 && (
                      <Link
                        href={`/painel/atendimentos/${at.id}/recibo`}
                        target="_blank"
                        className="font-medium text-primary hover:underline"
                      >
                        Recibo (PDF)
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Registro do Valor da Consulta */}
              {at.status !== "cancelado" && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <DollarSign className="size-3.5 text-primary" />
                    Valor Pago da Consulta
                  </span>
                  <FormAcao
                    acao={definirValorAcao.bind(null, at.id)}
                    textoBotao={typeof at.valorCentavos === "number" ? "Atualizar" : "Salvar Valor"}
                    textoPendente="Salvando…"
                    variante="outline"
                    aoConcluir={aoConcluirAcao}
                    className="flex items-center gap-2"
                  >
                    <InputMascara
                      mascara="moeda"
                      name="valor"
                      placeholder="0,00"
                      aria-label="Valor cobrado do paciente"
                      defaultValue={
                        typeof at.valorCentavos === "number"
                          ? (at.valorCentavos / 100).toFixed(2).replace(".", ",")
                          : ""
                      }
                      className="h-9 w-32 text-xs font-semibold tabular-nums"
                    />
                  </FormAcao>
                </div>
              )}

              {/* Ações de Status (Check-in / Chegou, Confirmar, Realizado, etc.) */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Atualizar Status da Consulta
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {transicoesPossiveis(at.status)
                    .filter((s) => s !== "cancelado")
                    .map((s) => (
                      <FormAcao
                        key={s}
                        acao={alterarStatusAcao.bind(null, at.id, s)}
                        textoBotao={s === "presente" ? "✓ Paciente Chegou (Check-in)" : ROTULO_ACAO_BOTAO[s]}
                        textoPendente="Atualizando…"
                        variante={s === "presente" ? "default" : s === "falta" ? "outline" : "secondary"}
                        aoConcluir={aoConcluirAcao}
                      />
                    ))}

                  {at.statusAnterior && (
                    <FormAcao
                      acao={desfazerStatusAcao.bind(null, at.id)}
                      textoBotao="Desfazer Última Mudança"
                      textoPendente="Desfazendo…"
                      variante="outline"
                      confirmar={`Voltar status para "${ROTULOS_STATUS[at.statusAnterior]}"?`}
                      aoConcluir={aoConcluirAcao}
                    />
                  )}
                </div>
              </div>

              {/* Remarcar */}
              {(at.status === "agendado" || at.status === "confirmado") && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Remarcar Horário ou Sala
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemarcando(!remarcando)}
                      className="text-xs font-medium text-primary"
                    >
                      {remarcando ? "Cancelar" : "Alterar horário"}
                    </Button>
                  </div>

                  {remarcando && (
                    <FormAcao
                      acao={remarcarAcao.bind(null, at.id)}
                      textoBotao="Confirmar Remarcação"
                      textoPendente="Remarcando…"
                      aoConcluir={aoConcluirAcao}
                      className="space-y-3 pt-1"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="remarcar-data" className="text-[11px]">Nova data</Label>
                          <Input id="remarcar-data" name="data" type="date" required defaultValue={dados.data} className="h-8 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="remarcar-inicio" className="text-[11px]">Início</Label>
                          <Input
                            id="remarcar-inicio"
                            name="horaInicio"
                            type="time"
                            step={slotMinutos * 60}
                            required
                            defaultValue={dados.horaInicio}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="remarcar-fim" className="text-[11px]">Término</Label>
                          <Input
                            id="remarcar-fim"
                            name="horaFim"
                            type="time"
                            step={slotMinutos * 60}
                            required
                            defaultValue={dados.horaFim}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      {salas.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="remarcar-sala" className="text-[11px]">Sala</Label>
                          <NativeSelect id="remarcar-sala" name="salaId" defaultValue={dados.salaId} className="h-8 text-xs">
                            {salas.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                      )}
                    </FormAcao>
                  )}
                </div>
              )}

              {/* Cancelamento da Consulta */}
              {transicoesPossiveis(at.status).includes("cancelado") && (
                <div className="pt-2 border-t border-border/40">
                  <FormAcao
                    acao={alterarStatusAcao.bind(null, at.id, "cancelado")}
                    textoBotao="Cancelar Agendamento"
                    textoPendente="Cancelando…"
                    variante="destructive"
                    confirmar="Deseja realmente cancelar este agendamento?"
                    aoConcluir={aoConcluirAcao}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <NativeSelect name="quem" defaultValue="paciente" className="h-9 w-40 text-xs">
                      <option value="paciente">Paciente pediu</option>
                      <option value="profissional">Profissional pediu</option>
                      {gerencia && <option value="espaco">Espaço cancelou (sem cobrança)</option>}
                    </NativeSelect>
                    <Input
                      name="motivo"
                      placeholder="Motivo (opcional)"
                      className="h-9 flex-1 text-xs"
                    />
                  </FormAcao>
                </div>
              )}
            </>
          ) : (
            /* Reserva de Turno Vaga (Médico tem horário reservado/contratado mas sem paciente) */
            <div className="space-y-4">
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-warning">
                    Turno Disponível
                  </span>
                  {res?.ehSalaFixa && (
                    <span className="inline-flex items-center rounded-md bg-warning/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-warning border border-warning/40">
                      {res.contratoCodigo ? `Contrato Fixa ${res.contratoCodigo}` : "Sala Fixa"}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-foreground">
                  🩺 {dados.profissionalNome}
                </h3>
                <p className="text-xs text-muted-foreground">
                  A sala está reservada para o profissional das {dados.horaInicio} às {dados.horaFim}, ainda sem paciente agendado.
                </p>
              </div>

              {/* Botão de Agendamento Rápido de Paciente */}
              <Button
                type="button"
                className="w-full h-11 text-sm font-semibold shadow-xs gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  aoFechar();
                  aoAbrirAgendamentoPaciente?.({
                    salaId: dados.salaId,
                    salaNome: dados.salaNome,
                    data: dados.data,
                    horaInicio: dados.horaInicio,
                    horaFim: dados.horaFim,
                    slotMinutos,
                    reserva: {
                      id: res?.id ?? "",
                      profissionalId: dados.profissionalId,
                      profissionalNome: dados.profissionalNome,
                      ehSalaFixa: res?.ehSalaFixa,
                      contratoCodigo: res?.contratoCodigo,
                      horaInicio: dados.horaInicio,
                      horaFim: dados.horaFim,
                    },
                  });
                }}
              >
                + Agendar Paciente neste Horário
              </Button>

              {/* Opção de Cancelar Reserva de Sala */}
              {res && res.status === "ativa" && (
                <div className="pt-3 border-t border-border/40">
                  <FormAcao
                    acao={cancelarReservaAcao.bind(null, res.id)}
                    textoBotao="Liberar / Cancelar Turno da Sala"
                    textoPendente="Liberando…"
                    variante="outline"
                    confirmar="Deseja liberar este horário reservado da sala?"
                    aoConcluir={aoConcluirAcao}
                    className="flex flex-col gap-2"
                  >
                    {gerencia && (
                      <NativeSelect name="quem" defaultValue="profissional" className="h-8 text-xs">
                        <option value="profissional">A pedido do profissional</option>
                        <option value="espaco">Decisão do espaço (sem multa)</option>
                      </NativeSelect>
                    )}
                    <Input name="motivo" placeholder="Motivo do cancelamento (opcional)" className="h-8 text-xs" />
                  </FormAcao>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ROTULO_ACAO_BOTAO: Record<string, string> = {
  agendado: "Agendar",
  confirmado: "Confirmar",
  presente: "✓ Chegou",
  realizado: "Concluir (Realizado)",
  falta: "Registrar Falta",
  cancelado: "Cancelar",
};
