import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { intervalosDoDia } from "@/src/domain/reservas";
import {
  dataValida,
  diaSemana,
  hojeNoFuso,
  horaDeMinutos,
  inicioDaSemana,
  minutosDoDia,
  partesLocais,
  somarDias,
} from "@/src/domain/tempo";
import { ROTULOS_STATUS } from "@/src/domain/agendamentos";
import {
  formatarDataBr,
  listarAgenda,
  listarProfissionaisParaReserva,
  obterPanoramaSalas,
  obterReserva,
} from "@/src/server/reservas";
import { listarUnidades } from "@/src/server/unidades";
import { atendimentosDaReserva } from "@/src/server/agendamentos";
import { listarPacientes } from "@/src/server/pacientes";
import { cancelarReservaAcao, criarReservaAcao, encerrarRecorrenciaAcao } from "./actions";
import { GradeAgenda, type ColunaGrade } from "./grade";
import { FormAgendamento, ListaAtendimentos } from "../atendimentos/componentes";

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametros = {
  unidade?: string;
  data?: string;
  visao?: "dia" | "semana";
  sala?: string;
  nova?: string;
  inicio?: string;
  reserva?: string;
  horaInicio?: string;
  horaFim?: string;
};

function lerParametros(brutos: Record<string, string | string[] | undefined>): Parametros {
  const p = (k: string) => (typeof brutos[k] === "string" ? (brutos[k] as string) : undefined);
  const uuid = (k: string) => (p(k) && UUID.test(p(k)!) ? p(k) : undefined);
  const hora = (k: string) => (p(k) && /^\d{2}:\d{2}$/.test(p(k)!) ? p(k) : undefined);
  return {
    unidade: uuid("unidade"),
    data: p("data") && dataValida(p("data")!) ? p("data") : undefined,
    visao: p("visao") === "semana" ? "semana" : "dia",
    sala: uuid("sala"),
    nova: uuid("nova"),
    inicio: hora("inicio"),
    reserva: uuid("reserva"),
    horaInicio: hora("horaInicio"),
    horaFim: hora("horaFim"),
  };
}

export default async function AgendaPage({ searchParams }: PageProps<"/painel/agenda">) {
  const ctx = await obterContextoTenant();
  const parametros = lerParametros(await searchParams);
  const unidades = (await listarUnidades(ctx)).filter((u) => u.ativo);
  const gerencia = pode(ctx.role, "reservas.gerenciar");
  const podeReservar = gerencia || pode(ctx.role, "reservas.proprias");

  if (unidades.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
            <CardDescription>
              Nenhuma unidade ativa.{" "}
              {pode(ctx.role, "salas.gerenciar") && (
                <Link href="/painel/unidades" className="text-primary underline-offset-4 hover:underline">
                  Cadastre a primeira unidade
                </Link>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const unidade = unidades.find((u) => u.id === parametros.unidade) ?? unidades[0];
  const agoraInstante = new Date();
  const hoje = hojeNoFuso(unidade.timezone, agoraInstante);
  const agora = partesLocais(agoraInstante, unidade.timezone);
  const data = parametros.data ?? hoje;
  const semana = parametros.visao === "semana";

  // Na visão semanal, mostra uma sala por vez (a escolhida ou a primeira).
  const agendaDia = await listarAgenda(ctx, { unidadeId: unidade.id, de: data, dias: 1 });
  const salas = agendaDia?.salas ?? [];
  const salaSemana = salas.find((s) => s.id === parametros.sala) ?? salas[0];
  const inicioSemana = inicioDaSemana(data);
  const agenda = semana
    ? await listarAgenda(ctx, { unidadeId: unidade.id, de: inicioSemana, dias: 7, salaId: salaSemana?.id })
    : agendaDia;
  if (!agenda) return null;
  const { config } = agenda;

  const colunas: ColunaGrade[] = semana
    ? salaSemana
      ? Array.from({ length: 7 }, (_, i) => {
          const d = somarDias(inicioSemana, i);
          return { chave: d, titulo: `${DIAS_CURTOS[diaSemana(d)]} ${formatarDataBr(d).slice(0, 5)}`, data: d, salaId: salaSemana.id };
        })
      : []
    : salas.map((s) => ({ chave: s.id, titulo: s.nome, data, salaId: s.id }));

  const intervalos = [...new Set(colunas.map((c) => c.data))].flatMap((d) => intervalosDoDia(config, d));
  const inicioMin = intervalos.length ? Math.min(...intervalos.map((i) => i.abre)) : 0;
  const fimMin = intervalos.length ? Math.max(...intervalos.map((i) => i.fecha)) : 0;

  const href = (extra: Partial<Parametros>) => {
    const q = new URLSearchParams();
    const tudo: Parametros = { unidade: unidade.id, data, visao: parametros.visao, sala: semana ? salaSemana?.id : undefined, ...extra };
    for (const [k, v] of Object.entries(tudo)) if (v) q.set(k, v);
    return `/painel/agenda?${q.toString()}`;
  };
  const passo = semana ? 7 : 1;

  const [profissionais, reservaAberta, panorama] = await Promise.all([
    listarProfissionaisParaReserva(ctx),
    parametros.reserva ? obterReserva(ctx, parametros.reserva) : Promise.resolve(null),
    gerencia ? obterPanoramaSalas(ctx, unidade.id, agoraInstante) : Promise.resolve(null),
  ]);
  const [atendimentosReserva, pacientes] = reservaAberta
    ? await Promise.all([atendimentosDaReserva(ctx, reservaAberta.id), listarPacientes(ctx)])
    : [[], []];

  // Pré-preenchimento ao clicar num horário livre.
  const novaSala = parametros.nova ?? (semana ? salaSemana?.id : salas[0]?.id);
  const novaData = data;
  const novaInicio = parametros.inicio ?? horaDeMinutos(inicioMin || 8 * 60);
  const novaFim = horaDeMinutos(Math.min(minutosDoDia(novaInicio) + 60, 24 * 60));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda de salas</h1>
          <p className="text-sm text-muted-foreground">
            {semana ? `Semana de ${formatarDataBr(inicioSemana)}` : formatarDataBr(data)} · {unidade.nome}
          </p>
        </div>

      {panorama && (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-primary/5 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Panorama das Salas em Tempo Real
              </h2>
              <p className="text-xs text-muted-foreground">
                Visão consolidada do funcionamento de hoje · {unidade.nome}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg border bg-background/80 px-2.5 py-1 font-medium shadow-2xs">
                📅 <strong>{panorama.resumoDia.totalConsultas}</strong> consultas hoje
              </span>
              <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400">
                ⏳ <strong>{panorama.resumoDia.pacientesAguardando}</strong> na recepção
              </span>
              <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
                ✓ <strong>{panorama.resumoDia.consultasRealizadas}</strong> concluídas
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {panorama.salas.map((s) => {
              const emAtendimento = s.estado === "em_atendimento";
              const reservada = s.estado === "reservada_vaga";
              return (
                <div
                  key={s.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 text-xs transition-all ${
                    emAtendimento
                      ? "border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20"
                      : reservada
                        ? "border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/20"
                        : "border-border/60 bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-semibold text-foreground text-sm">{s.nome}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        emAtendimento
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          : reservada
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {emAtendimento ? "Em atendimento" : reservada ? "Reservada" : "Livre"}
                    </span>
                  </div>

                  {emAtendimento && s.atendimentoAtual && s.reserva && (
                    <div className="mt-2.5 space-y-1">
                      <p className="font-medium text-foreground truncate">
                        👤 {s.atendimentoAtual.pacienteNome}
                      </p>
                      <p className="text-muted-foreground truncate">
                        🩺 {s.reserva.profissionalNome}
                      </p>
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[11px]">
                        <span>{s.atendimentoAtual.horaInicio}–{s.atendimentoAtual.horaFim}</span>
                        {s.atendimentoAtual.status === "presente" ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">Na recepção</span>
                        ) : (
                          <span className="text-muted-foreground">{ROTULOS_STATUS[s.atendimentoAtual.status]}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {reservada && s.reserva && (
                    <div className="mt-2.5 space-y-1">
                      <p className="font-medium text-foreground truncate">
                        🩺 {s.reserva.profissionalNome}
                      </p>
                      <p className="text-muted-foreground">
                        {s.reserva.ehSalaFixa ? "Locação Sala Fixa" : "Reserva do Profissional"}
                      </p>
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[11px] text-muted-foreground">
                        <span>{s.reserva.horaInicio}–{s.reserva.horaFim}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Horário vago</span>
                      </div>
                    </div>
                  )}

                  {!emAtendimento && !reservada && (
                    <div className="mt-2.5 text-muted-foreground">
                      <p className="text-[11px]">Disponível para reservas imediatas.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
        <form className="flex flex-wrap items-end gap-2" action="/painel/agenda">
          {unidades.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="unidade" className="text-xs">
                Unidade
              </Label>
              <NativeSelect id="unidade" name="unidade" defaultValue={unidade.id} className="w-44">
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {unidades.length === 1 && <input type="hidden" name="unidade" value={unidade.id} />}
          <div className="flex flex-col gap-1">
            <Label htmlFor="data" className="text-xs">
              Data
            </Label>
            <Input id="data" name="data" type="date" defaultValue={data} className="w-40" />
          </div>
          {semana && salas.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="sala" className="text-xs">
                Sala
              </Label>
              <NativeSelect id="sala" name="sala" defaultValue={salaSemana?.id} className="w-36">
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <input type="hidden" name="visao" value={parametros.visao} />
          <Button type="submit" variant="outline">
            Ir
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button asChild variant="outline" size="sm">
          <Link href={href({ data: somarDias(data, -passo) })}>← Anterior</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href({ data: hoje })}>Hoje</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href({ data: somarDias(data, passo) })}>Próximo →</Link>
        </Button>
        <span className="mx-2 h-4 w-px bg-border" />
        <Button asChild variant={semana ? "outline" : "secondary"} size="sm">
          <Link href={href({ visao: "dia", sala: undefined })}>Dia (todas as salas)</Link>
        </Button>
        <Button asChild variant={semana ? "secondary" : "outline"} size="sm">
          <Link href={href({ visao: "semana" })}>Semana (por sala)</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <GradeAgenda
          config={config}
          colunas={colunas}
          reservas={agenda.reservas}
          inicioMin={inicioMin}
          fimMin={fimMin}
          agora={{ data: agora.data, minutos: agora.minutos }}
          podeReservar={podeReservar}
          hrefSlot={(c, hora) => href({ nova: c.salaId, inicio: hora, data: c.data, reserva: undefined })}
          hrefReserva={(r, seg) =>
            gerencia || r.propria
              ? href({
                  reserva: r.id,
                  horaInicio: seg?.tipo === "vago" ? seg.horaInicio : undefined,
                  horaFim: seg?.tipo === "vago" ? seg.horaFim : undefined,
                  nova: undefined,
                })
              : null
          }
        />

        <aside className="flex flex-col gap-4">
          {reservaAberta && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reserva</CardTitle>
                <CardDescription>
                  {reservaAberta.salaNome} · {formatarDataBr(reservaAberta.data)} · {reservaAberta.horaInicio}–{reservaAberta.horaFim}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      🩺 {reservaAberta.profissionalNome}
                    </p>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {reservaAberta.status === "ativa" ? "Ativa" : reservaAberta.status === "concluida" ? "Concluída" : "Cancelada"}
                      {reservaAberta.recorrenciaId && " · reserva semanal"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {reservaAberta.ehSalaFixa && (
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {reservaAberta.contratoCodigo ? `Fixa ${reservaAberta.contratoCodigo}` : "Sala Fixa"}
                      </span>
                    )}
                    {atendimentosReserva.length > 0 ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        🟢 Ocupada ({atendimentosReserva.length})
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        🟡 Sem paciente
                      </span>
                    )}
                  </div>
                </div>

                {atendimentosReserva.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>⏳</span> Sala reservada para o profissional, ainda sem paciente.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Os horários abaixo estão vagos e disponíveis para agendar pacientes.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-950 dark:text-emerald-100 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>👤</span> Ocupada com atendimento(s):
                    </p>
                    <div className="space-y-1">
                      {atendimentosReserva.map((at) => (
                        <div key={at.id} className="flex items-center justify-between font-medium text-foreground text-xs">
                          <span>{at.pacienteNome}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {at.horaInicio}–{at.horaFim}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reservaAberta.ehSalaFixa && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-amber-800 dark:text-amber-300 block">
                        {reservaAberta.contratoCodigo ? `Contrato ${reservaAberta.contratoCodigo}` : "Locação de Sala Fixa"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Horário reservado por contrato mensal
                      </span>
                    </div>
                    {reservaAberta.contratoId && (
                      <Link
                        href={`/painel/contratos/${reservaAberta.contratoId}`}
                        className="rounded-md bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0"
                      >
                        Ver contrato →
                      </Link>
                    )}
                  </div>
                )}

                {reservaAberta.status === "ativa" && (
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Horários vagos ({reservaAberta.horariosVagos.length})
                      </p>
                      {reservaAberta.ehSalaFixa && (
                        <span className="text-[11px] text-muted-foreground">Contrato mensal</span>
                      )}
                    </div>
                    {reservaAberta.horariosVagos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Todos os horários desta reserva já foram agendados.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {reservaAberta.horariosVagos.map((v) => {
                          const selecionado = parametros.horaInicio === v.inicio;
                          return (
                            <Link
                              key={`${v.inicio}-${v.fim}`}
                              href={href({
                                reserva: reservaAberta.id,
                                horaInicio: v.inicio,
                                horaFim: v.fim,
                              })}
                              scroll={false}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                selecionado
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "bg-background hover:border-primary hover:text-primary"
                              }`}
                              title={`Preencher formulário das ${v.inicio} às ${v.fim}`}
                            >
                              <span>{v.inicio}–{v.fim}</span>
                              <span className={`text-[10px] ${selecionado ? "opacity-80" : "text-muted-foreground"}`}>
                                ({v.duracaoMinutos}m)
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t pt-3">
                  <p className="font-medium">Pacientes</p>
                  <ListaAtendimentos atendimentos={atendimentosReserva} mostrarProfissional={false} />
                </div>
                {reservaAberta.status === "ativa" && reservaAberta.fim > new Date() && (() => {
                  const vagoPadrao = reservaAberta.horariosVagos?.[0];
                  const inicioAg = parametros.horaInicio ?? vagoPadrao?.inicio ?? reservaAberta.horaInicio;
                  const fimMax = vagoPadrao?.fim ?? reservaAberta.horaFim;
                  const fimAg = parametros.horaFim ?? horaDeMinutos(Math.min(minutosDoDia(inicioAg) + 60, minutosDoDia(fimMax)));
                  return (
                    <div className="flex flex-col gap-2 border-t pt-3">
                      <p className="font-medium">Agendar paciente nesta reserva</p>
                      <FormAgendamento
                        pacientes={pacientes.map((p) => ({ id: p.id, nome: p.nome }))}
                        profissionais={[]}
                        salas={[]}
                        reservaId={reservaAberta.id}
                        data={reservaAberta.data}
                        horaInicio={inicioAg}
                        horaFim={fimAg}
                        slotMinutos={config.slotMinutos}
                      />
                    </div>
                  );
                })()}
                {reservaAberta.status === "ativa" && (
                  <FormAcao
                    acao={cancelarReservaAcao.bind(null, reservaAberta.id)}
                    textoBotao={reservaAberta.recorrenciaId ? "Cancelar só esta data" : "Cancelar reserva"}
                    textoPendente="Cancelando…"
                    variante="destructive"
                    confirmar="Cancelar esta reserva?"
                  >
                    <Input name="motivo" placeholder="Motivo (opcional)" aria-label="Motivo do cancelamento" />
                  </FormAcao>
                )}
                {reservaAberta.status === "ativa" && reservaAberta.recorrenciaId && reservaAberta.dataOcorrencia && (
                  <FormAcao
                    acao={encerrarRecorrenciaAcao.bind(null, reservaAberta.recorrenciaId, reservaAberta.dataOcorrencia)}
                    textoBotao="Encerrar série a partir desta data"
                    textoPendente="Encerrando…"
                    variante="outline"
                    confirmar="Cancelar esta e todas as próximas ocorrências da série?"
                  />
                )}
                <Link href={href({ reserva: undefined })} scroll={false} className="text-xs text-muted-foreground hover:underline">
                  Fechar
                </Link>
              </CardContent>
            </Card>
          )}

          {podeReservar && salas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nova reserva</CardTitle>
                <CardDescription>Clique num horário livre da grade para preencher.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* key: remonta o formulário quando o slot clicado muda (defaultValue). */}
                <FormAcao key={`${novaSala}-${novaData}-${novaInicio}`} acao={criarReservaAcao} textoBotao="Reservar" textoPendente="Reservando…">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="salaId">Sala</Label>
                    <NativeSelect id="salaId" name="salaId" defaultValue={novaSala}>
                      {salas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  {gerencia && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="profissionalId">Profissional</Label>
                      <NativeSelect id="profissionalId" name="profissionalId" required defaultValue="">
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
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="data-reserva">Data</Label>
                    <Input id="data-reserva" name="data" type="date" defaultValue={novaData} min={hoje} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="horaInicio">Início</Label>
                      <Input id="horaInicio" name="horaInicio" type="time" step={config.slotMinutos * 60} defaultValue={novaInicio} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="horaFim">Fim</Label>
                      <Input id="horaFim" name="horaFim" type="time" step={config.slotMinutos * 60} defaultValue={novaFim} required />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="repetir" /> Repetir toda semana
                  </label>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="dataFim">Repetir até (opcional)</Label>
                    <Input id="dataFim" name="dataFim" type="date" min={novaData} />
                  </div>
                </FormAcao>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

