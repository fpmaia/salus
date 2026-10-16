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
import {
  formatarDataBr,
  listarAgenda,
  listarProfissionaisParaReserva,
  obterReserva,
} from "@/src/server/reservas";
import { listarUnidades } from "@/src/server/unidades";
import { cancelarReservaAcao, criarReservaAcao, encerrarRecorrenciaAcao } from "./actions";
import { GradeAgenda, type ColunaGrade } from "./grade";

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
};

function lerParametros(brutos: Record<string, string | string[] | undefined>): Parametros {
  const p = (k: string) => (typeof brutos[k] === "string" ? (brutos[k] as string) : undefined);
  const uuid = (k: string) => (p(k) && UUID.test(p(k)!) ? p(k) : undefined);
  return {
    unidade: uuid("unidade"),
    data: p("data") && dataValida(p("data")!) ? p("data") : undefined,
    visao: p("visao") === "semana" ? "semana" : "dia",
    sala: uuid("sala"),
    nova: uuid("nova"),
    inicio: p("inicio") && /^\d{2}:\d{2}$/.test(p("inicio")!) ? p("inicio") : undefined,
    reserva: uuid("reserva"),
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

  const [profissionais, reservaAberta] = await Promise.all([
    listarProfissionaisParaReserva(ctx),
    parametros.reserva ? obterReserva(ctx, parametros.reserva) : Promise.resolve(null),
  ]);

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
          hrefReserva={(r) => (gerencia || r.propria ? href({ reserva: r.id, nova: undefined }) : null)}
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
                <p>
                  {reservaAberta.profissionalNome}
                  <span className="block text-xs text-muted-foreground">
                    {reservaAberta.status === "ativa" ? "Ativa" : reservaAberta.status === "concluida" ? "Concluída" : "Cancelada"}
                    {reservaAberta.recorrenciaId && " · reserva semanal"}
                  </span>
                </p>
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

