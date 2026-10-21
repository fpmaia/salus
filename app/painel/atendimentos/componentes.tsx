import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "cn";
import { ROTULOS_STATUS, transicoesPossiveis, type StatusAgendamento } from "@/src/domain/agendamentos";
import { podeDesfazerStatus, type AtendimentoDoDia } from "@/src/server/agendamentos";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { definirValorAcao } from "../financeiro/actions";
import { alterarStatusAcao, criarAgendamentoAcao, desfazerStatusAcao, remarcarAcao } from "./actions";
import { CampoPaciente } from "./campo-paciente";

const ROTULO_ACAO: Record<StatusAgendamento, string> = {
  agendado: "Agendar",
  confirmado: "Confirmar",
  presente: "Check-in",
  realizado: "Realizado",
  falta: "Falta",
  cancelado: "Cancelar",
};

const COR_STATUS: Record<StatusAgendamento, string> = {
  agendado: "bg-muted text-foreground",
  confirmado: "bg-primary/15 text-primary",
  presente: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  realizado: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
  falta: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground line-through",
};

export function SeloStatus({ status, tardio }: { status: StatusAgendamento; tardio?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1.5",
        status === "presente"
          ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 font-semibold"
          : COR_STATUS[status]
      )}
    >
      {status === "presente" && <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />}
      {status === "presente" ? "Na Recepção" : ROTULOS_STATUS[status]}
      {tardio && " · tardio"}
    </span>
  );
}

/** Lista de atendimentos com as ações de status permitidas pelo fluxo. */
export function ListaAtendimentos({
  atendimentos,
  mostrarProfissional = true,
  linkProntuario = false,
  cancelamentoPeloEspaco = true,
  salas = [],
  slotMinutos = 30,
  podeDesfazer = false,
}: {
  atendimentos: AtendimentoDoDia[];
  /** Salas da unidade, para remarcar em outra sala. */
  salas?: Opcao[];
  slotMinutos?: number;
  /** Equipe: desfaz a última mudança de status (até 24h). */
  podeDesfazer?: boolean;
  mostrarProfissional?: boolean;
  /** Profissional: atalho para o prontuário do paciente. */
  linkProntuario?: boolean;
  /** A equipe pode registrar que o espaço cancelou (não cobra o profissional). */
  cancelamentoPeloEspaco?: boolean;
}) {
  if (atendimentos.length === 0) return <p className="text-sm text-muted-foreground">Nenhum atendimento.</p>;
  return (
    <ul className="divide-y divide-border/60">
      {atendimentos.map((a) => (
        <li key={a.id} className="flex flex-col gap-2.5 py-3.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold tabular-nums text-foreground">
                {a.horaInicio}–{a.horaFim}
              </span>{" "}
              <Link href={`/painel/pacientes/${a.pacienteId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {a.pacienteNome}
              </Link>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {[mostrarProfissional && a.profissionalNome, a.salaNome, a.pacienteTelefone].filter(Boolean).join(" · ")}
              </span>
              {a.observacao && <span className="block text-xs text-muted-foreground italic">Obs.: {a.observacao}</span>}
              {a.remarcadoEm && <span className="block text-xs text-muted-foreground">Remarcado</span>}
              {linkProntuario && (
                <Link href={`/painel/prontuario/${a.pacienteId}`} className="text-xs text-primary font-medium underline-offset-4 hover:underline inline-block mt-1">
                  Ver Prontuário →
                </Link>
              )}
            </span>
            <span className="flex items-center gap-2">
              {a.origem === "online" && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">online</span>}
              <SeloStatus status={a.status} tardio={a.cancelamentoTardio} />
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
            {/* Registro de Pagamento da Consulta */}
            {a.status !== "cancelado" && (
              <FormAcao
                acao={definirValorAcao.bind(null, a.id)}
                textoBotao={a.valorCentavos === null ? "Registrar Pagamento" : "Alterar Valor"}
                textoPendente="Salvando…"
                variante={a.valorCentavos === null ? "secondary" : "outline"}
                className="flex flex-wrap items-center gap-1.5"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">R$</span>
                  <Input
                    name="valor"
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Valor cobrado do paciente"
                    defaultValue={a.valorCentavos === null ? "" : (a.valorCentavos / 100).toFixed(2).replace(".", ",")}
                    title={a.valorCentavos === null ? "Informe o valor pago" : `Registrado: ${formatarMoeda(a.valorCentavos)}`}
                    className="h-8 w-24 text-xs font-medium tabular-nums"
                  />
                </div>
              </FormAcao>
            )}

            {/* Ações de Transição de Status (Check-in, Confirmar, Realizado, Falta) */}
            {transicoesPossiveis(a.status)
              .filter((s) => s !== "cancelado")
              .map((s) => (
                <FormAcao
                  key={s}
                  acao={alterarStatusAcao.bind(null, a.id, s)}
                  textoBotao={s === "presente" ? "✓ Check-in" : ROTULO_ACAO[s]}
                  textoPendente="…"
                  variante={s === "presente" ? "default" : s === "falta" ? "outline" : "secondary"}
                  className={`flex items-center gap-2 ${
                    s === "presente" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs" : ""
                  }`}
                />
              ))}

            {podeDesfazer && a.statusAnterior && podeDesfazerStatus(a) && (
              <FormAcao
                acao={desfazerStatusAcao.bind(null, a.id)}
                textoBotao={`Desfazer (voltar a ${ROTULOS_STATUS[a.statusAnterior]})`}
                textoPendente="…"
                variante="outline"
                confirmar={`Desfazer "${ROTULOS_STATUS[a.status]}" e voltar para "${ROTULOS_STATUS[a.statusAnterior]}"?`}
                className="flex items-center gap-2"
              />
            )}

            {(a.status === "agendado" || a.status === "confirmado") && (
              <details className="w-full">
                <summary className="cursor-pointer text-xs font-medium text-primary">Remarcar</summary>
                <FormAcao
                  acao={remarcarAcao.bind(null, a.id)}
                  textoBotao="Remarcar"
                  textoPendente="Remarcando…"
                  variante="secondary"
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`rm-${a.id}-data`} className="text-xs">Nova data</Label>
                    <Input id={`rm-${a.id}-data`} name="data" type="date" required className="h-8 w-36 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`rm-${a.id}-inicio`} className="text-xs">Início</Label>
                    <Input id={`rm-${a.id}-inicio`} name="horaInicio" type="time" step={slotMinutos * 60} required defaultValue={a.horaInicio} className="h-8 w-28 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`rm-${a.id}-fim`} className="text-xs">Fim</Label>
                    <Input id={`rm-${a.id}-fim`} name="horaFim" type="time" step={slotMinutos * 60} required defaultValue={a.horaFim} className="h-8 w-28 text-xs" />
                  </div>
                  {salas.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`rm-${a.id}-sala`} className="text-xs">Sala</Label>
                      <NativeSelect id={`rm-${a.id}-sala`} name="salaId" defaultValue="" className="h-8 w-40 text-xs">
                        <option value="">A mesma ({a.salaNome})</option>
                        {salas.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}
                </FormAcao>
                <p className="mt-1 text-xs text-muted-foreground">Remarcar não gera cobrança. O lembrete do horário antigo é descartado.</p>
              </details>
            )}

            {transicoesPossiveis(a.status).includes("cancelado") && (
              <FormAcao
                acao={alterarStatusAcao.bind(null, a.id, "cancelado")}
                textoBotao="Cancelar"
                textoPendente="…"
                variante="destructive"
                confirmar="Cancelar este agendamento?"
                className="flex flex-wrap items-center gap-2 ml-auto"
              >
                <NativeSelect name="quem" defaultValue="paciente" aria-label="Quem pediu o cancelamento" className="h-8 w-40 text-xs">
                  <option value="paciente">Paciente pediu</option>
                  <option value="profissional">Profissional pediu</option>
                  {cancelamentoPeloEspaco && <option value="espaco">Espaço cancelou (sem cobrança)</option>}
                </NativeSelect>
                <Input name="motivo" placeholder="Motivo (opcional)" aria-label="Motivo do cancelamento" className="h-8 w-36 text-xs" />
              </FormAcao>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

type Opcao = { id: string; nome: string };

/**
 * Formulário de agendamento. Com `reservaId`, encaixa nesta reserva; sem ele, usa a
 * reserva do profissional no horário ou reserva a sala escolhida.
 */
export function FormAgendamento({
  profissionais,
  salas,
  reservaId,
  data,
  horaInicio,
  horaFim,
  slotMinutos,
  salaId,
}: {
  /** Vazio para o profissional (agenda para si). */
  profissionais: Opcao[];
  /** Vazio quando há reservaId. */
  salas: Opcao[];
  reservaId?: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  slotMinutos: number;
  /** Sala pré-escolhida (agendar direto num horário vago da grade). */
  salaId?: string;
}) {
  const id = (campo: string) => `ag-${reservaId ?? "novo"}-${campo}`;
  return (
    <FormAcao key={`${reservaId}-${salaId}-${data}-${horaInicio}-${horaFim}`} acao={criarAgendamentoAcao} textoBotao="Agendar" textoPendente="Agendando…">
      {reservaId && <input type="hidden" name="reservaId" value={reservaId} />}
      <CampoPaciente />
      {profissionais.length > 0 && !reservaId && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("profissional")}>Profissional</Label>
          <NativeSelect id={id("profissional")} name="profissionalId" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {salas.length > 0 && !reservaId && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("sala")}>Sala</Label>
          <NativeSelect id={id("sala")} name="salaId" defaultValue={salaId ?? ""}>
            <option value="">Usar reserva existente do profissional</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} (reserva se estiver livre)
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("data")}>Data</Label>
        <Input id={id("data")} name="data" type="date" defaultValue={data} readOnly={Boolean(reservaId)} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("inicio")}>Início</Label>
          <Input id={id("inicio")} name="horaInicio" type="time" step={slotMinutos * 60} defaultValue={horaInicio} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("fim")}>Fim</Label>
          <Input id={id("fim")} name="horaFim" type="time" step={slotMinutos * 60} defaultValue={horaFim} required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("obs")}>Observação (administrativa)</Label>
        <Input id={id("obs")} name="observacao" maxLength={300} placeholder="Ex.: primeira consulta" />
      </div>
    </FormAcao>
  );
}
