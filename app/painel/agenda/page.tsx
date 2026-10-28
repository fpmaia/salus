import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { intervalosDoDia } from "@/src/domain/reservas";
import {
  dataValida,
  diaSemana,
  hojeNoFuso,
  inicioDaSemana,
  partesLocais,
  somarDias,
} from "@/src/domain/tempo";
import {
  formatarDataBr,
  listarAgenda,
  listarProfissionaisParaReserva,
  obterPanoramaSalas,
} from "@/src/server/reservas";
import { listarUnidades } from "@/src/server/unidades";
import { atendimentosDoDia } from "@/src/server/agendamentos";
import { minhaRegraDePreco } from "@/src/server/financeiro";
import { PrecoEstimado } from "@/components/preco-estimado";
import { type ColunaGrade } from "./grade";
import { AgendaUnificada } from "./agenda-unificada";
import { ListaDoProfissional } from "./lista-do-profissional";

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametros = {
  unidade?: string;
  data?: string;
  visao?: "dia" | "semana" | "lista";
  sala?: string;
};

function lerParametros(brutos: Record<string, string | string[] | undefined>): Parametros {
  const p = (k: string) => (typeof brutos[k] === "string" ? (brutos[k] as string) : undefined);
  const uuid = (k: string) => (p(k) && UUID.test(p(k)!) ? p(k) : undefined);
  const v = p("visao");
  return {
    unidade: uuid("unidade"),
    data: p("data") && dataValida(p("data")!) ? p("data") : undefined,
    visao: v === "semana" ? "semana" : v === "lista" ? "lista" : "dia",
    sala: uuid("sala"),
  };
}

export default async function AgendaPage({ searchParams }: PageProps<"/painel/agenda">) {
  const ctx = await obterContextoTenant();
  const parametros = lerParametros(await searchParams);
  const unidades = (await listarUnidades(ctx)).filter((u) => u.ativo);
  const gerencia = pode(ctx.role, "reservas.gerenciar");
  const podeReservar = gerencia || pode(ctx.role, "reservas.proprias");
  const podeProntuario = pode(ctx.role, "prontuario.proprio");

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

  const [agenda, profissionais, panorama, diaAtendimentos, meuPreco] = await Promise.all([
    semana
      ? listarAgenda(ctx, { unidadeId: unidade.id, de: inicioSemana, dias: 7, salaId: salaSemana?.id })
      : Promise.resolve(agendaDia),
    listarProfissionaisParaReserva(ctx),
    gerencia ? obterPanoramaSalas(ctx, unidade.id, agoraInstante) : Promise.resolve(null),
    atendimentosDoDia(ctx, unidade.id, data),
    !gerencia && pode(ctx.role, "extrato.proprio") ? minhaRegraDePreco(ctx, agoraInstante) : Promise.resolve(undefined),
  ]);

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

  const precoEstimado =
    meuPreco === undefined ? null : <PrecoEstimado regra={meuPreco?.regra ?? null} contratoCodigo={meuPreco?.contrato.codigo} />;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* No celular, o profissional vê primeiro a própria lista do dia (a grade fica abaixo). */}
      {!gerencia && <ListaDoProfissional reservas={agenda.reservas.filter((r) => r.propria)} semana={semana} />}
      <AgendaUnificada
        unidade={unidade}
        unidades={unidades}
        data={data}
        hoje={hoje}
        visao={parametros.visao ?? "dia"}
        salas={salas}
        salaSemana={salaSemana}
        inicioSemana={inicioSemana}
        config={config}
        colunas={colunas}
        reservas={agenda.reservas}
        atendimentosDoDia={diaAtendimentos?.atendimentos ?? []}
        inicioMin={inicioMin}
        fimMin={fimMin}
        agora={{ data: agora.data, minutos: agora.minutos }}
        podeReservar={podeReservar}
        gerencia={gerencia}
        podeProntuario={podeProntuario}
        profissionais={profissionais}
        panoramaSalas={panorama}
        precoEstimado={precoEstimado}
      />
    </main>
  );
}
