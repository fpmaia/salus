"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, MapPin, User, X } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CampoPaciente } from "../atendimentos/campo-paciente";
import { criarAgendamentoAcao } from "../atendimentos/actions";
import { criarReservaAcao } from "./actions";
import { formatarDataBr } from "@/src/domain/tempo";

export type DadosSlotAbertura = {
  salaId: string;
  salaNome: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  slotMinutos: number;
  reserva?: {
    id: string;
    profissionalId?: string | null;
    profissionalNome?: string | null;
    ehSalaFixa?: boolean;
    contratoCodigo?: string | null;
    horaInicio: string;
    horaFim: string;
  } | null;
};

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  dados: DadosSlotAbertura | null;
  profissionais: { id: string; nome: string }[];
  salas: { id: string; nome: string }[];
  podeReservar: boolean;
  gerencia: boolean;
  hoje: string;
  precoEstimado?: React.ReactNode;
};

export function ModalAgendamento({
  aberto,
  aoFechar,
  dados,
  profissionais,
  salas,
  gerencia,
  precoEstimado,
}: Props) {
  const router = useRouter();
  const [modo, setModo] = useState<"consulta" | "reserva">("consulta");

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

  const temReservaDoMedico = Boolean(dados.reserva?.profissionalNome);
  const reserva = dados.reserva;

  const aoConcluirSucesso = () => {
    aoFechar();
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/80 bg-background shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calendar className="size-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
                {temReservaDoMedico ? "Agendar Paciente" : "Novo Agendamento"}
              </h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 text-muted-foreground" />
                  {dados.salaNome}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium">
                  {formatarDataBr(dados.data)}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Clock className="size-3 text-muted-foreground" />
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

        {/* Corpo com scroll caso necessário */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Se clicou em um horário que já tem reserva ou contrato do médico */}
          {temReservaDoMedico && reserva ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
                    <User className="size-3.5" />
                    Turno Reservado do Médico
                  </span>
                  {reserva.ehSalaFixa && (
                    <span className="inline-flex items-center rounded-md bg-warning/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-warning border border-warning/40">
                      {reserva.contratoCodigo ? `Contrato Fixa ${reserva.contratoCodigo}` : "Sala Fixa"}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-foreground">
                  🩺 {reserva.profissionalNome}
                </p>
                <p className="text-xs text-muted-foreground">
                  Este horário já está reservado para este médico. Selecione o paciente abaixo para confirmar a consulta.
                </p>
              </div>

              <FormAcao
                acao={criarAgendamentoAcao}
                textoBotao="Confirmar Agendamento do Paciente"
                textoPendente="Agendando…"
                aoConcluir={aoConcluirSucesso}
                className="space-y-4"
              >
                <input type="hidden" name="reservaId" value={reserva.id} />
                {reserva.profissionalId && (
                  <input type="hidden" name="profissionalId" value={reserva.profissionalId} />
                )}
                <input type="hidden" name="salaId" value={dados.salaId} />
                <input type="hidden" name="data" value={dados.data} />

                {/* Seletor ou Cadastro Rápido de Paciente */}
                <div className="rounded-xl border border-border/70 bg-card p-3.5">
                  <CampoPaciente label="Paciente da Consulta" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ag-modal-inicio" className="text-xs font-medium">
                      Horário de Início
                    </Label>
                    <Input
                      id="ag-modal-inicio"
                      name="horaInicio"
                      type="time"
                      step={dados.slotMinutos * 60}
                      defaultValue={dados.horaInicio}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ag-modal-fim" className="text-xs font-medium">
                      Horário de Término
                    </Label>
                    <Input
                      id="ag-modal-fim"
                      name="horaFim"
                      type="time"
                      step={dados.slotMinutos * 60}
                      defaultValue={dados.horaFim}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ag-modal-obs" className="text-xs font-medium">
                    Observação Interna (opcional)
                  </Label>
                  <Input
                    id="ag-modal-obs"
                    name="observacao"
                    maxLength={300}
                    placeholder="Ex.: Primeira consulta, retorno, exames..."
                  />
                </div>
              </FormAcao>
            </div>
          ) : (
            /* Horário Livre: Permite escolher entre agendar com paciente ou só reservar a sala */
            <div className="space-y-4">
              {/* Abas de Modo */}
              <div className="grid grid-cols-2 rounded-xl bg-muted/60 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setModo("consulta")}
                  className={`rounded-lg py-2 transition-all ${
                    modo === "consulta"
                      ? "bg-background text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Agendar Consulta (Paciente)
                </button>
                <button
                  type="button"
                  onClick={() => setModo("reserva")}
                  className={`rounded-lg py-2 transition-all ${
                    modo === "reserva"
                      ? "bg-background text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Apenas Reservar Sala
                </button>
              </div>

              {modo === "consulta" ? (
                /* Formulário de Consulta */
                <FormAcao
                  acao={criarAgendamentoAcao}
                  textoBotao="Confirmar Agendamento"
                  textoPendente="Agendando…"
                  aoConcluir={aoConcluirSucesso}
                  className="space-y-4"
                >
                  <input type="hidden" name="data" value={dados.data} />

                  {/* Paciente */}
                  <div className="rounded-xl border border-border/70 bg-card p-3.5">
                    <CampoPaciente label="Paciente" />
                  </div>

                  {/* Médico / Profissional */}
                  {gerencia && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="consulta-prof" className="text-xs font-medium">
                        Médico / Profissional
                      </Label>
                      <NativeSelect id="consulta-prof" name="profissionalId" required defaultValue="">
                        <option value="" disabled>
                          Selecione o profissional…
                        </option>
                        {profissionais.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}

                  {/* Sala */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="consulta-sala" className="text-xs font-medium">
                      Sala
                    </Label>
                    <NativeSelect id="consulta-sala" name="salaId" defaultValue={dados.salaId}>
                      {salas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome} {s.id === dados.salaId ? "(selecionada)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="consulta-inicio" className="text-xs font-medium">
                        Início
                      </Label>
                      <Input
                        id="consulta-inicio"
                        name="horaInicio"
                        type="time"
                        step={dados.slotMinutos * 60}
                        defaultValue={dados.horaInicio}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="consulta-fim" className="text-xs font-medium">
                        Término
                      </Label>
                      <Input
                        id="consulta-fim"
                        name="horaFim"
                        type="time"
                        step={dados.slotMinutos * 60}
                        defaultValue={dados.horaFim}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="consulta-obs" className="text-xs font-medium">
                      Observação (opcional)
                    </Label>
                    <Input
                      id="consulta-obs"
                      name="observacao"
                      maxLength={300}
                      placeholder="Ex.: Primeira consulta, convênio..."
                    />
                  </div>

                  {precoEstimado}
                </FormAcao>
              ) : (
                /* Formulário de Apenas Reserva de Sala */
                <FormAcao
                  acao={criarReservaAcao}
                  textoBotao="Reservar Horário da Sala"
                  textoPendente="Reservando…"
                  aoConcluir={aoConcluirSucesso}
                  className="space-y-4"
                >
                  <input type="hidden" name="data" value={dados.data} />

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="reserva-sala" className="text-xs font-medium">
                      Sala
                    </Label>
                    <NativeSelect id="reserva-sala" name="salaId" defaultValue={dados.salaId}>
                      {salas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  {gerencia && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reserva-prof" className="text-xs font-medium">
                        Profissional / Locatário
                      </Label>
                      <NativeSelect id="reserva-prof" name="profissionalId" required defaultValue="">
                        <option value="" disabled>
                          Selecione o profissional…
                        </option>
                        {profissionais.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reserva-inicio" className="text-xs font-medium">
                        Início
                      </Label>
                      <Input
                        id="reserva-inicio"
                        name="horaInicio"
                        type="time"
                        step={dados.slotMinutos * 60}
                        defaultValue={dados.horaInicio}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reserva-fim" className="text-xs font-medium">
                        Término
                      </Label>
                      <Input
                        id="reserva-fim"
                        name="horaFim"
                        type="time"
                        step={dados.slotMinutos * 60}
                        defaultValue={dados.horaFim}
                        required
                      />
                    </div>
                  </div>

                  {/* Recorrência */}
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reserva-repetir" className="text-xs font-medium">
                        Repetição
                      </Label>
                      <NativeSelect id="reserva-repetir" name="repetir" defaultValue="">
                        <option value="">Não repetir (reserva avulsa)</option>
                        <option value="semanal">Toda semana</option>
                        <option value="quinzenal">A cada 2 semanas</option>
                        <option value="mensal">Todo mês</option>
                      </NativeSelect>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reserva-datafim" className="text-xs font-medium">
                        Repetir até (opcional)
                      </Label>
                      <Input
                        id="reserva-datafim"
                        name="dataFim"
                        type="date"
                        min={dados.data}
                      />
                    </div>
                  </div>

                  {precoEstimado}
                </FormAcao>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
