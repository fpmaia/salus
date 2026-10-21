import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obterContextoTenant } from "@/src/auth/sessao";
import { DIAS_SEMANA_NOMES } from "@/src/domain/contratos";
import { ROTULOS_MODELO } from "@/src/domain/financeiro";
import { pode } from "@/src/domain/rbac";
import { hojeNoFuso } from "@/src/domain/tempo";
import { obterContrato } from "@/src/server/contratos";
import { mensagemDeErro } from "@/src/server/erros";
import { formatarDataBr } from "@/src/server/reservas";
import { encerrarContratoAcao } from "../actions";
import { COR_SITUACAO, ROTULO_SITUACAO } from "../situacao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContratoPage({ params, searchParams }: PageProps<"/painel/contratos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await obterContextoTenant();
  const detalhe = await obterContrato(ctx, id).catch((erro) => {
    if (mensagemDeErro(erro)) notFound();
    throw erro;
  });
  const { contrato, profissional, situacao, condicoes, grade, versoes } = detalhe;
  const q = await searchParams;
  const conflitos = typeof q.conflitos === "string" ? q.conflitos.split(",") : [];
  const gerencia = pode(ctx.role, "contratos.gerenciar");
  const aberto = situacao !== "encerrado";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {ctx.role === "profissional" ? (
            <Link href="/painel/extrato" className="text-sm text-muted-foreground hover:underline">
              ← Meu extrato
            </Link>
          ) : (
            <Link href="/painel/contratos" className="text-sm text-muted-foreground hover:underline">
              ← Contratos
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="font-mono">{contrato.codigo}</span> · {profissional.nome}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ROTULOS_MODELO[contrato.modelo]} · {formatarDataBr(contrato.vigenteDe)}{" "}
            {contrato.vigenteAte ? `até ${formatarDataBr(contrato.vigenteAte)}` : "sem término"}{" "}
            <span className={`ml-1 rounded-md px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[situacao]}`}>{ROTULO_SITUACAO[situacao]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/painel/contratos/${contrato.id}/imprimir`}>Imprimir / PDF</Link>
          </Button>
          {gerencia && aberto && (
            <Button asChild>
              <Link href={`/painel/contratos/novo?profissional=${profissional.id}`}>Reajustar (nova versão)</Link>
            </Button>
          )}
        </div>
      </div>

      {q.criado && (
        <p className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
          Contrato criado{q.reservas ? `: ${q.reservas} data(s) da grade fixa reservada(s)` : ""}.
          {conflitos.length > 0 && (
            <span className="mt-1 block text-amber-700">
              Atenção: a sala já estava ocupada em {conflitos.length} data(s) da grade ({conflitos.slice(0, 5).join("; ")}
              {conflitos.length > 5 ? "…" : ""}). Essas datas não foram reservadas; resolva na agenda.
            </span>
          )}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condições</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {condicoes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {contrato.observacoes && <p className="mt-3 text-sm text-muted-foreground">Obs.: {contrato.observacoes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade fixa</CardTitle>
          <CardDescription>Horários reservados automaticamente toda semana enquanto o contrato vale.</CardDescription>
        </CardHeader>
        <CardContent>
          {grade.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem grade fixa: o profissional reserva as salas avulsas.</p>
          ) : (
            <ul className="divide-y text-sm">
              {grade.map((g) => (
                <li key={g.id} className="flex justify-between py-2">
                  <span>
                    {DIAS_SEMANA_NOMES[g.diaSemana]}, {g.horaInicio}–{g.horaFim}
                  </span>
                  <span className="text-muted-foreground">
                    {g.unidadeNome} · {g.salaNome}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {contrato.termos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Termos</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">{contrato.termos}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versões do contrato de {profissional.nome}</CardTitle>
          <CardDescription>Cada reajuste é uma versão; os meses passados seguem a versão da época.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {versoes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/painel/contratos/${v.id}`} className={`font-mono ${v.id === contrato.id ? "font-semibold" : "text-primary hover:underline"}`}>
                  {v.codigo}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatarDataBr(v.vigenteDe)} → {v.vigenteAte ? formatarDataBr(v.vigenteAte) : "sem término"} · {ROTULO_SITUACAO[v.situacao]}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {gerencia && aberto && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Encerrar contrato</CardTitle>
            <CardDescription>
              Depois do último dia, a grade fixa é liberada (datas com pacientes agendados continuam até os atendimentos serem resolvidos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao
              acao={encerrarContratoAcao.bind(null, contrato.id)}
              textoBotao="Encerrar contrato"
              textoPendente="Encerrando…"
              variante="destructive"
              confirmar="Encerrar este contrato na data informada?"
            >
              <div className="flex max-w-xs flex-col gap-2">
                <Label htmlFor="ultimoDia">Último dia de vigência</Label>
                <Input id="ultimoDia" name="ultimoDia" type="date" required defaultValue={hojeNoFuso("America/Sao_Paulo")} min={contrato.vigenteDe} />
              </div>
            </FormAcao>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
