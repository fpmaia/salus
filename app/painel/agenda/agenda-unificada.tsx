"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  LayoutGrid,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatarDataBr, horaDeMinutos, minutosDoDia, somarDias, type DataLocal } from "@/src/domain/tempo";
import type { ReservaNaAgenda, ConfigUnidade, SegmentoReserva } from "@/src/domain/reservas";
import type { AtendimentoDoDia, StatusAgendamento } from "@/src/domain/agendamentos";
import { GradeAgenda, type ColunaGrade } from "./grade";
import { GradeArrastavel } from "./arrastar";
import { ModalAgendamento, type DadosSlotAbertura } from "./modal-agendamento";
import { ModalDetalhesEvento, type DadosEventoDetalhe } from "./modal-detalhes-evento";
import { ListaAtendimentos } from "../atendimentos/componentes";

type Unidade = { id: string; nome: string; timezone: string };
type Sala = { id: string; nome: string };

type Props = {
  unidade: Unidade;
  unidades: Unidade[];
  data: string;
  hoje: string;
  visao: "dia" | "semana" | "lista";
  salas: Sala[];
  salaSemana?: Sala;
  inicioSemana: string;
  config: ConfigUnidade;
  colunas: ColunaGrade[];
  reservas: ReservaNaAgenda[];
  atendimentosDoDia: AtendimentoDoDia[];
  inicioMin: number;
  fimMin: number;
  agora: { data: DataLocal; minutos: number };
  podeReservar: boolean;
  gerencia: boolean;
  podeProntuario: boolean;
  profissionais: { id: string; nome: string }[];
  panoramaSalas?: {
    resumoDia: {
      totalConsultas: number;
      pacientesAguardando: number;
      consultasRealizadas: number;
    };
    salas: Array<{
      id: string;
      nome: string;
      estado: "livre" | "reservada_vaga" | "em_atendimento";
      reserva?: { profissionalNome: string; ehSalaFixa?: boolean } | null;
      atendimentoAtual?: { pacienteNome: string; horaInicio: string; horaFim: string } | null;
    }>;
  } | null;
  precoEstimado?: React.ReactNode;
};

export function AgendaUnificada({
  unidade,
  unidades,
  data,
  hoje,
  visao,
  salas,
  salaSemana,
  inicioSemana,
  config,
  colunas,
  reservas,
  atendimentosDoDia,
  inicioMin,
  fimMin,
  agora,
  podeReservar,
  gerencia,
  podeProntuario,
  profissionais,
  panoramaSalas,
  precoEstimado,
}: Props) {
  const router = useRouter();

  // Estados dos Modais
  const [modalAgendamentoAberto, setModalAgendamentoAberto] = useState(false);
  const [slotParaAgendar, setSlotParaAgendar] = useState<DadosSlotAbertura | null>(null);

  const [modalDetalhesAberto, setModalDetalhesAberto] = useState(false);
  const [eventoParaDetalhar, setEventoParaDetalhar] = useState<DadosEventoDetalhe | null>(null);

  // Navegação de URLs
  const hrefParams = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const tudo: Record<string, string | undefined> = {
      unidade: unidade.id,
      data,
      visao,
      sala: visao === "semana" ? salaSemana?.id : undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(tudo)) if (v) q.set(k, v);
    return `/painel/agenda?${q.toString()}`;
  };

  const passo = visao === "semana" ? 7 : 1;

  // Handler de clique em slot aberto da grade
  const handleSlotClick = (coluna: ColunaGrade, hora: string) => {
    const slotMin = minutosDoDia(hora);
    const horaFim = horaDeMinutos(Math.min(slotMin + config.slotMinutos, 24 * 60));

    // Procura se esse slot está contido em alguma reserva/contrato de médico
    const resInter = reservas.find((r) => {
      if (r.salaId !== coluna.salaId || r.data !== coluna.data) return false;
      const rIni = minutosDoDia(r.horaInicio);
      const rFim = minutosDoDia(r.horaFim);
      return slotMin >= rIni && slotMin < rFim && r.status === "ativa";
    });

    const salaObj = salas.find((s) => s.id === coluna.salaId);

    setSlotParaAgendar({
      salaId: coluna.salaId,
      salaNome: salaObj?.nome ?? coluna.titulo,
      data: coluna.data,
      horaInicio: hora,
      horaFim,
      slotMinutos: config.slotMinutos,
      reserva: resInter
        ? {
            id: resInter.id,
            profissionalId: resInter.profissionalId,
            profissionalNome: resInter.profissionalNome,
            ehSalaFixa: resInter.ehSalaFixa,
            contratoCodigo: resInter.contratoCodigo,
            horaInicio: resInter.horaInicio,
            horaFim: resInter.horaFim,
          }
        : null,
    });
    setModalAgendamentoAberto(true);
  };

  // Handler de clique em reserva / consulta da grade
  const handleReservaClick = (r: ReservaNaAgenda, seg: SegmentoReserva) => {
    const salaObj = salas.find((s) => s.id === r.salaId);
    const salaNome = salaObj?.nome ?? "Sala";

    if (seg.tipo === "vago") {
      // É um turno reservado ou contratado pelo médico, sem paciente ainda:
      // Abre DIRETO o modal no modo "Agendar Paciente", com médico e sala já travados!
      setSlotParaAgendar({
        salaId: r.salaId,
        salaNome,
        data: r.data,
        horaInicio: seg.horaInicio,
        horaFim: seg.horaFim,
        slotMinutos: config.slotMinutos,
        reserva: {
          id: r.id,
          profissionalId: r.profissionalId,
          profissionalNome: r.profissionalNome,
          ehSalaFixa: r.ehSalaFixa,
          contratoCodigo: r.contratoCodigo,
          horaInicio: r.horaInicio,
          horaFim: r.horaFim,
        },
      });
      setModalAgendamentoAberto(true);
    } else {
      // É uma consulta de paciente: abre os detalhes com opções de check-in / status
      const at = atendimentosDoDia.find((a) => a.id === seg.atendimentoId);
      setEventoParaDetalhar({
        tipo: "atendimento",
        salaId: r.salaId,
        salaNome,
        data: r.data,
        horaInicio: seg.horaInicio,
        horaFim: seg.horaFim,
        profissionalNome: r.profissionalNome,
        profissionalId: r.profissionalId,
        atendimento: at
          ? {
              id: at.id,
              pacienteId: at.pacienteId,
              pacienteNome: at.pacienteNome,
              pacienteTelefone: at.pacienteTelefone,
              status: at.status,
              statusAnterior: at.statusAnterior,
              valorCentavos: at.valorCentavos,
              observacao: at.observacao,
              remarcadoEm: at.remarcadoEm,
              cancelamentoTardio: at.cancelamentoTardio,
              origem: at.origem,
            }
          : {
              id: seg.atendimentoId ?? "",
              pacienteId: "",
              pacienteNome: seg.pacienteNome ?? "Paciente",
              status: (seg.statusAtendimento as StatusAgendamento | undefined) ?? "agendado",
            },
        reserva: {
          id: r.id,
          ehSalaFixa: r.ehSalaFixa,
          contratoCodigo: r.contratoCodigo,
          contratoId: r.contratoId,
          recorrenciaId: r.recorrenciaId,
          status: r.status,
        },
      });
      setModalDetalhesAberto(true);
    }
  };

  // Abrir botão primário "+ Novo Agendamento"
  const abrirNovoAgendamento = () => {
    const primeiraSala = salas[0];
    const horaSugestao = horaDeMinutos(Math.max(inicioMin, 8 * 60));
    const horaFimSugestao = horaDeMinutos(Math.min(minutosDoDia(horaSugestao) + config.slotMinutos, 24 * 60));

    setSlotParaAgendar({
      salaId: primeiraSala?.id ?? "",
      salaNome: primeiraSala?.nome ?? "Sala 1",
      data,
      horaInicio: horaSugestao,
      horaFim: horaFimSugestao,
      slotMinutos: config.slotMinutos,
    });
    setModalAgendamentoAberto(true);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de Ferramentas Superior da Agenda */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5 shadow-xs backdrop-blur-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Data e Título */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarIcon className="size-5" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {visao === "semana"
                  ? `Semana de ${formatarDataBr(inicioSemana)}`
                  : formatarDataBr(data)}
                {data === hoje && visao !== "semana" && (
                  <span className="ml-2 text-xs font-semibold text-primary bg-primary/15 px-2 py-0.5 rounded-full inline-block">
                    Hoje
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unidade.nome} · {salas.length} {salas.length === 1 ? "sala ativa" : "salas ativas"}
              </p>
            </div>
          </div>

          {/* Botão Primário "+ Novo Agendamento" */}
          <Button
            type="button"
            onClick={abrirNovoAgendamento}
            className="h-10 gap-2 font-semibold shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 ml-auto"
          >
            <Plus className="size-4" />
            <span>Novo Agendamento</span>
          </Button>
        </div>

        {/* Linha de Controles: Navegação temporal + Seletor de Visão + Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/50">
          {/* Navegação < Hoje > e Datepicker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-border/70 bg-background shadow-2xs overflow-hidden">
              <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 rounded-none">
                <Link href={hrefParams({ data: somarDias(data, -passo) })} title="Período anterior">
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-8 px-3 rounded-none font-semibold text-xs border-x border-border/60">
                <Link href={hrefParams({ data: hoje })}>Hoje</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 rounded-none">
                <Link href={hrefParams({ data: somarDias(data, passo) })} title="Próximo período">
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>

            {/* Input de Data Direto */}
            <form action="/painel/agenda" className="flex items-center gap-1.5">
              <input type="hidden" name="unidade" value={unidade.id} />
              <input type="hidden" name="visao" value={visao} />
              {visao === "semana" && salaSemana && <input type="hidden" name="sala" value={salaSemana.id} />}
              <Input
                name="data"
                type="date"
                defaultValue={data}
                onChange={(e) => {
                  if (e.target.value) {
                    router.push(hrefParams({ data: e.target.value }));
                  }
                }}
                className="h-8 w-36 text-xs font-medium"
              />
            </form>

            {/* Seletor de Unidades (se houver mais de 1) */}
            {unidades.length > 1 && (
              <NativeSelect
                name="unidade"
                defaultValue={unidade.id}
                onChange={(e) => router.push(hrefParams({ unidade: e.target.value }))}
                className="h-8 w-44 text-xs font-medium"
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </NativeSelect>
            )}

            {/* Seletor de Sala na Visão Semanal */}
            {visao === "semana" && salas.length > 0 && (
              <NativeSelect
                name="sala"
                defaultValue={salaSemana?.id}
                onChange={(e) => router.push(hrefParams({ sala: e.target.value }))}
                className="h-8 w-40 text-xs font-medium"
              >
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          {/* Abas de Modo de Visualização da Agenda */}
          <div className="flex items-center rounded-xl bg-muted/70 p-1 text-xs font-semibold">
            <Link
              href={hrefParams({ visao: "dia", sala: undefined })}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                visao === "dia"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              <span>Salas do Dia</span>
            </Link>
            <Link
              href={hrefParams({ visao: "semana", sala: salaSemana?.id ?? salas[0]?.id })}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                visao === "semana"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="size-3.5" />
              <span>Semana</span>
            </Link>
            <Link
              href={hrefParams({ visao: "lista" })}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                visao === "lista"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListTodo className="size-3.5" />
              <span>Lista de Consultas ({atendimentosDoDia.length})</span>
            </Link>
          </div>
        </div>

        {/* Faixa Compacta e Elegante de Ocupação das Salas em Tempo Real */}
        {panoramaSalas && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-border/40 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border bg-background/80 px-2.5 py-1 font-medium text-foreground">
                📅 <strong>{panoramaSalas.resumoDia.totalConsultas}</strong> consultas hoje
              </span>
              <span className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 font-semibold text-warning flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-warning animate-pulse" />
                ⏳ <strong>{panoramaSalas.resumoDia.pacientesAguardando}</strong> aguardando recepção
              </span>
              <span className="rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 font-semibold text-success">
                ✓ <strong>{panoramaSalas.resumoDia.consultasRealizadas}</strong> concluídas
              </span>
            </div>

            {/* Chips Rápidos de Status das Salas */}
            <div className="flex flex-wrap items-center gap-1.5">
              {panoramaSalas.salas.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    s.estado === "em_atendimento"
                      ? "border-success/40 bg-success/10 text-success"
                      : s.estado === "reservada_vaga"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
                  }`}
                  title={
                    s.estado === "em_atendimento"
                      ? `${s.nome}: Em atendimento (${s.atendimentoAtual?.pacienteNome})`
                      : s.estado === "reservada_vaga"
                      ? `${s.nome}: Reservada para ${s.reserva?.profissionalNome}`
                      : `${s.nome}: Disponível`
                  }
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      s.estado === "em_atendimento"
                        ? "bg-success"
                        : s.estado === "reservada_vaga"
                        ? "bg-warning"
                        : "bg-muted-foreground/50"
                    }`}
                  />
                  <span>{s.nome}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seletor de Sala em Abas / Pílulas no Modo Semana */}
        {visao === "semana" && salas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/40 text-xs">
            <span className="font-semibold text-muted-foreground mr-1 flex items-center gap-1.5">
              <span>🏢</span> Visualizando semana da sala:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {salas.map((s) => {
                const ativa = s.id === salaSemana?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => router.push(hrefParams({ sala: s.id }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                      ativa
                        ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/25"
                        : "bg-background text-foreground hover:bg-muted border border-border/70"
                    }`}
                  >
                    <span>{s.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo Principal de Acordo com a Visão Escolhida */}
      {visao === "lista" ? (
        /* Visão em Lista de Consultas da Recepção */
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">
                Consultas do Dia ({formatarDataBr(data)})
              </h2>
              <p className="text-xs text-muted-foreground">
                Lista de atendimentos, check-in de chegada de pacientes e recebimentos
              </p>
            </div>
          </div>

          <ListaAtendimentos
            atendimentos={atendimentosDoDia}
            mostrarProfissional={gerencia}
            linkProntuario={podeProntuario}
            cancelamentoPeloEspaco={gerencia}
            podeDesfazer={gerencia}
            salas={salas}
            slotMinutos={config.slotMinutos}
          />
        </div>
      ) : (
        /* Visão em Grade Estilo Google Calendar (Dia ou Semana) */
        <GradeArrastavel slotMinutos={config.slotMinutos}>
          <GradeAgenda
            config={config}
            colunas={colunas}
            reservas={reservas}
            inicioMin={inicioMin}
            fimMin={fimMin}
            agora={{ data: agora.data, minutos: agora.minutos }}
            podeReservar={podeReservar}
            isSemana={visao === "semana"}
            aoClicarSlot={handleSlotClick}
            aoClicarReserva={handleReservaClick}
          />
        </GradeArrastavel>
      )}

      {/* Modal de Agendamento Rápido ao Clicar na Grade ou no Botão */}
      <ModalAgendamento
        aberto={modalAgendamentoAberto}
        aoFechar={() => {
          setModalAgendamentoAberto(false);
          setSlotParaAgendar(null);
        }}
        dados={slotParaAgendar}
        profissionais={profissionais}
        salas={salas}
        podeReservar={podeReservar}
        gerencia={gerencia}
        hoje={hoje}
        precoEstimado={precoEstimado}
      />

      {/* Modal de Detalhes da Consulta / Evento ao Clicar na Grade */}
      <ModalDetalhesEvento
        aberto={modalDetalhesAberto}
        aoFechar={() => {
          setModalDetalhesAberto(false);
          setEventoParaDetalhar(null);
        }}
        dados={eventoParaDetalhar}
        gerencia={gerencia}
        podeProntuario={podeProntuario}
        salas={salas}
        slotMinutos={config.slotMinutos}
        aoAbrirAgendamentoPaciente={(dadosRes) => {
          setSlotParaAgendar(dadosRes);
          setModalAgendamentoAberto(true);
        }}
      />
    </div>
  );
}
