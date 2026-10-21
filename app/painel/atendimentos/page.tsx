import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { STATUS_ATIVOS } from "@/src/domain/agendamentos";
import { pode } from "@/src/domain/rbac";
import { dataValida, hojeNoFuso, horaDeMinutos, minutosDoDia, partesLocais, somarDias } from "@/src/domain/tempo";
import { atendimentosDoDia } from "@/src/server/agendamentos";
import { sugestoesDaEspera } from "@/src/server/lista-espera";
import { formatarDataBr, listarAgenda, listarProfissionaisParaReserva } from "@/src/server/reservas";
import { listarUnidades } from "@/src/server/unidades";
import { FormAgendamento, ListaAtendimentos } from "./componentes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AtendimentosPage({ searchParams }: PageProps<"/painel/atendimentos">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "agenda.propria");
  const brutos = await searchParams;
  const unidades = (await listarUnidades(ctx)).filter((u) => u.ativo);
  if (unidades.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Nenhuma unidade ativa.</p>
      </main>
    );
  }

  const unidadeParam = typeof brutos.unidade === "string" && UUID.test(brutos.unidade) ? brutos.unidade : undefined;
  const unidade = unidades.find((u) => u.id === unidadeParam) ?? unidades[0];
  const agora = new Date();
  const hoje = hojeNoFuso(unidade.timezone, agora);
  const data = typeof brutos.data === "string" && dataValida(brutos.data) ? brutos.data : hoje;

  const [dia, agenda, profissionais] = await Promise.all([
    atendimentosDoDia(ctx, unidade.id, data),
    listarAgenda(ctx, { unidadeId: unidade.id, de: data, dias: 1 }),
    listarProfissionaisParaReserva(ctx),
  ]);
  const atendimentos = dia?.atendimentos ?? [];
  const ativos = atendimentos.filter((a) => STATUS_ATIVOS.includes(a.status));
  const encerrados = atendimentos.filter((a) => !STATUS_ATIVOS.includes(a.status));
  const slot = dia?.config.slotMinutos ?? 30;

  // Horário sugerido: próximo slot a partir de agora (hoje) ou 08:00.
  const agoraMin = data === hoje ? partesLocais(agora, unidade.timezone).minutos : 8 * 60;
  const sugestao = Math.min(Math.ceil(agoraMin / slot) * slot, 23 * 60);
  const href = (d: string) => `/painel/atendimentos?unidade=${unidade.id}&data=${d}`;
  const equipe = pode(ctx.role, "agenda.gerenciar");
  // Horários que abriram (cancelados que ainda não começaram): quem está na lista de espera.
  const abertos = equipe ? encerrados.filter((a) => a.status === "cancelado" && a.inicio > agora) : [];
  const sugestoes = equipe ? await sugestoesDaEspera(ctx, abertos.map((a) => a.profissionalId)) : new Map();
  const propsLista = {
    mostrarProfissional: equipe,
    linkProntuario: pode(ctx.role, "prontuario.proprio"),
    cancelamentoPeloEspaco: equipe,
    podeDesfazer: equipe,
    salas: agenda?.salas ?? [],
    slotMinutos: slot,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consultas</h1>
          <p className="text-sm text-muted-foreground">
            {formatarDataBr(data)}
            {data === hoje && " (hoje)"} · {unidade.nome}
            {!pode(ctx.role, "agenda.gerenciar") && " · somente os seus"}
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/painel/atendimentos">
          {unidades.length > 1 ? (
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
          ) : (
            <input type="hidden" name="unidade" value={unidade.id} />
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="data" className="text-xs">
              Data
            </Label>
            <Input id="data" name="data" type="date" defaultValue={data} className="w-40" />
          </div>
          <Button type="submit" variant="outline">
            Ir
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={href(somarDias(data, -1))}>← Anterior</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(hoje)}>Hoje</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(somarDias(data, 1))}>Próximo →</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Na agenda ({ativos.length})</CardTitle>
              <CardDescription>Confirme, marque a chegada e registre a consulta ou a falta.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListaAtendimentos atendimentos={ativos} {...propsLista} />
            </CardContent>
          </Card>
          {abertos.some((a) => (sugestoes.get(a.profissionalId)?.length ?? 0) > 0) && (
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="text-base">Horários que abriram</CardTitle>
                <CardDescription>Quem está na lista de espera para esses horários. Entre em contato e agende.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3 text-sm">
                  {abertos
                    .filter((a) => (sugestoes.get(a.profissionalId)?.length ?? 0) > 0)
                    .map((a) => (
                      <li key={a.id} className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="font-semibold tabular-nums">
                              {a.horaInicio}–{a.horaFim}
                            </span>{" "}
                            · {a.profissionalNome} · {a.salaNome}
                          </span>
                          <Link
                            href={`/painel/agenda?unidade=${unidade.id}&data=${data}&nova=${a.salaId}&inicio=${a.horaInicio}`}
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Agendar neste horário →
                          </Link>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Na espera:{" "}
                          {sugestoes
                            .get(a.profissionalId)!
                            .map((e: { pacienteNome: string; pacienteTelefone: string | null }) => [e.pacienteNome, e.pacienteTelefone].filter(Boolean).join(" "))
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {encerrados.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Encerrados ({encerrados.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ListaAtendimentos atendimentos={encerrados} {...propsLista} />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Nova consulta</CardTitle>
            <CardDescription>Encaixa na reserva do profissional ou reserva a sala escolhida.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormAgendamento
              profissionais={profissionais}
              salas={agenda?.salas ?? []}
              data={data}
              horaInicio={horaDeMinutos(sugestao)}
              horaFim={horaDeMinutos(Math.min(minutosDoDia(horaDeMinutos(sugestao)) + 60, 24 * 60))}
              slotMinutos={slot}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
