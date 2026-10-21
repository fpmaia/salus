import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "cn";
import { ROTULOS_STATUS, transicoesPossiveis, type StatusAgendamento } from "@/src/domain/agendamentos";
import type { AtendimentoDoDia } from "@/src/server/agendamentos";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { definirValorAcao } from "../financeiro/actions";
import { alterarStatusAcao, criarAgendamentoAcao } from "./actions";

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
}: {
  atendimentos: AtendimentoDoDia[];
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
  pacientes,
  profissionais,
  salas,
  reservaId,
  data,
  horaInicio,
  horaFim,
  slotMinutos,
}: {
  pacientes: Opcao[];
  /** Vazio para o profissional (agenda para si). */
  profissionais: Opcao[];
  /** Vazio quando há reservaId. */
  salas: Opcao[];
  reservaId?: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  slotMinutos: number;
}) {
  const id = (campo: string) => `ag-${reservaId ?? "novo"}-${campo}`;
  if (pacientes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum paciente disponível.{" "}
        <Link href="/painel/pacientes" className="text-primary underline-offset-4 hover:underline">
          Cadastre um paciente
        </Link>
        .
      </p>
    );
  }
  return (
    <FormAcao key={`${reservaId}-${data}-${horaInicio}-${horaFim}`} acao={criarAgendamentoAcao} textoBotao="Agendar" textoPendente="Agendando…">
      {reservaId && <input type="hidden" name="reservaId" value={reservaId} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("paciente")}>Paciente</Label>
        <NativeSelect id={id("paciente")} name="pacienteId" required defaultValue="">
          <option value="" disabled>
            Escolha…
          </option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </NativeSelect>
      </div>
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
          <NativeSelect id={id("sala")} name="salaId" defaultValue="">
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
