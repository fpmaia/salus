import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, DoorOpen, UserCheck, Wallet } from "lucide-react";
import { PrimeirosPassos } from "@/components/primeiros-passos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { primeiroNome } from "@/src/domain/notificacoes";
import { pode } from "@/src/domain/rbac";
import { minhaSemana, painelHoje, resumoDoMes } from "@/src/server/painel";
import { primeirosPassos } from "@/src/server/primeiros-passos";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "./financeiro/componentes";

// Início por papel: admin vê o mês (e o dia), recepção vê o dia, profissional vê a semana.

function Indicador({ titulo, valor, detalhe, alerta, href, icone }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean; href?: string; icone: ReactNode }) {
  const conteudo = (
    <Card className={alerta ? "border-amber-500/50" : undefined}>
      <CardHeader className="gap-1">
        <CardDescription className="flex items-center gap-1.5">
          {icone}
          {titulo}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valor}</CardTitle>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardHeader>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function SecaoHoje({ ctx }: { ctx: Awaited<ReturnType<typeof obterContextoTenant>> }) {
  const hoje = await painelHoje(ctx);
  const lista = (titulo: string, itens: typeof hoje.proximos, vazio: string, destaque?: boolean) => (
    <Card className={destaque && itens.length ? "border-amber-500/50" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">
          {titulo} ({itens.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="divide-y text-sm">
            {itens.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold tabular-nums">{a.horaInicio}</span>{" "}
                  <Link href={`/painel/pacientes/${a.pacienteId}`} className="text-primary underline-offset-4 hover:underline">
                    {a.pacienteNome}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {[a.profissionalNome, a.salaNome, a.pacienteTelefone].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-hoje">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="titulo-hoje" className="text-lg font-semibold">
          Hoje
        </h2>
        <Button asChild size="sm">
          <Link href="/painel/atendimentos">Abrir as consultas do dia</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Consultas hoje" valor={String(hoje.total)} detalhe={`${hoje.realizadas} realizada(s)`} icone={<CalendarDays className="size-4" />} />
        <Indicador titulo="Na recepção" valor={String(hoje.naRecepcao.length)} detalhe="Chegaram e aguardam" icone={<UserCheck className="size-4" />} />
        <Indicador
          titulo="Atrasados"
          valor={String(hoje.atrasados.length)}
          detalhe="Passou do horário sem chegada"
          alerta={hoje.atrasados.length > 0}
          href="/painel/atendimentos"
          icone={<Clock className="size-4" />}
        />
        <Indicador
          titulo="Salas livres agora"
          valor={String(hoje.salasLivres.length)}
          detalhe={`${hoje.salasOcupadas} em uso ou reservada(s)`}
          href="/painel/agenda"
          icone={<DoorOpen className="size-4" />}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {lista("Atrasados", hoje.atrasados, "Ninguém atrasado.", true)}
        {lista("A confirmar", hoje.aConfirmar, "Todas as consultas de hoje estão confirmadas.")}
        {lista("Próximos", hoje.proximos, "Sem mais consultas hoje.")}
      </div>
    </section>
  );
}

async function SecaoSemana({ ctx }: { ctx: Awaited<ReturnType<typeof obterContextoTenant>> }) {
  const semana = await minhaSemana(ctx);
  const total = semana.saldo + semana.previsto;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-semana">
      <h2 id="titulo-semana" className="text-lg font-semibold">
        Minha semana
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Consultas nos próximos 7 dias" valor={String(semana.consultas.length)} href="/painel/atendimentos" icone={<CalendarDays className="size-4" />} />
        <Indicador
          titulo="Saldo com o espaço"
          valor={semana.saldo === 0 ? "Em dia" : semana.saldo > 0 ? `${formatarMoeda(semana.saldo)} a pagar` : `${formatarMoeda(-semana.saldo)} a receber`}
          detalhe={semana.previsto ? `Previsto no fechamento: ${formatarMoeda(total)}` : undefined}
          href="/painel/extrato"
          icone={<Wallet className="size-4" />}
        />
        <Card>
          <CardHeader className="gap-2">
            <CardDescription>Atalhos</CardDescription>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/painel/agenda">Reservar sala</Link>
              </Button>
              {semana.pagamentoOnline && semana.saldo > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/painel/extrato">Pagar com PIX</Link>
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas consultas</CardTitle>
          </CardHeader>
          <CardContent>
            {semana.consultas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta nos próximos 7 dias.</p>
            ) : (
              <ul className="divide-y text-sm">
                {semana.consultas.slice(0, 10).map((c) => (
                  <li key={c.id} className="py-2">
                    <span className="font-semibold tabular-nums">
                      {formatarDataBr(c.data).slice(0, 5)} {c.horaInicio}
                    </span>{" "}
                    <Link href={`/painel/pacientes/${c.pacienteId}`} className="text-primary underline-offset-4 hover:underline">
                      {c.pacienteNome}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {c.salaNome} · {c.unidadeNome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas reservas de sala</CardTitle>
          </CardHeader>
          <CardContent>
            {semana.reservas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma reserva.{" "}
                <Link href="/painel/agenda" className="text-primary underline-offset-4 hover:underline">
                  Reservar uma sala
                </Link>
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {semana.reservas.map((r) => (
                  <li key={r.id} className="py-2">
                    <span className="font-semibold tabular-nums">
                      {formatarDataBr(r.data).slice(0, 5)} {r.horaInicio}–{r.horaFim}
                    </span>{" "}
                    {r.salaNome}
                    <span className="block text-xs text-muted-foreground">
                      {r.unidadeNome}
                      {r.recorrente && " · recorrente"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

async function SecaoMes({ ctx }: { ctx: Awaited<ReturnType<typeof obterContextoTenant>> }) {
  const mes = await resumoDoMes(ctx);
  const pendencias = [
    mes.anterior.abertos > 0 && {
      texto: `${rotuloCompetencia(mes.anterior.competencia)}: ${mes.anterior.abertos} profissional(is) sem o mês fechado`,
      href: `/painel/financeiro?competencia=${mes.anterior.competencia.slice(0, 7)}`,
    },
    mes.cobrancasVencidas.n > 0 && {
      texto: `${mes.cobrancasVencidas.n} cobrança(s) vencida(s), ${formatarMoeda(mes.cobrancasVencidas.total)}`,
      href: "/painel/financeiro",
    },
    ...mes.semContrato.map((p) => ({ texto: `${p.nome} está sem contrato (nada é cobrado)`, href: `/painel/contratos/novo?profissional=${p.id}` })),
  ].filter((p): p is { texto: string; href: string } => Boolean(p));
  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-mes">
      <h2 id="titulo-mes" className="text-lg font-semibold">
        {rotuloCompetencia(mes.competencia)}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Receita de locação no mês" valor={formatarMoeda(mes.receitaCentavos)} href="/painel/financeiro" icone={<Wallet className="size-4" />} />
        <Indicador titulo="Ocupação das salas" valor={pct(mes.ocupacao)} detalhe="Horas reservadas no horário de funcionamento" icone={<DoorOpen className="size-4" />} />
        <Indicador
          titulo="A receber dos profissionais"
          valor={formatarMoeda(mes.aReceberCentavos)}
          detalhe={`${mes.devedores} com saldo devedor`}
          href="/painel/financeiro"
          icone={<Wallet className="size-4" />}
        />
      </div>
      <Card className={pendencias.length ? "border-amber-500/50" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {pendencias.length ? <AlertTriangle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
            Pendências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {pendencias.map((p) => (
                <li key={p.texto}>
                  <Link href={p.href} className="text-primary underline-offset-4 hover:underline">
                    {p.texto}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default async function PainelPage() {
  const ctx = await obterContextoTenant();
  const etapas = pode(ctx.role, "tenant.configurar") ? await primeirosPassos(ctx) : [];
  const ehAdmin = pode(ctx.role, "financeiro.fechar");
  const ehEquipe = pode(ctx.role, "agenda.gerenciar");
  const ehProfissional = pode(ctx.role, "extrato.proprio");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {primeiroNome(ctx.usuario.nome)}</h1>
        <p className="text-sm text-muted-foreground">{ctx.tenantNome}</p>
      </div>
      {etapas.length > 0 && <PrimeirosPassos etapas={etapas} />}
      {ehAdmin && <SecaoMes ctx={ctx} />}
      {ehEquipe && <SecaoHoje ctx={ctx} />}
      {ehProfissional && <SecaoSemana ctx={ctx} />}
    </main>
  );
}
