import Link from "next/link";
import { AlertTriangle, BadgePercent, CheckCircle2, Clock, DollarSign, Download, ExternalLink, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { obterPainelFinanceiro, type FiltrosFaturas } from "@/src/server/plataforma-painel";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "@/app/painel/financeiro/componentes";
import { AcoesFatura } from "../faturas/acoes-fatura";
import { acessoPlataforma } from "../acesso";

const STATUS: Record<string, { classe: string; rotulo: string }> = {
  paga: { classe: "bg-success/15 text-success", rotulo: "Paga" },
  pendente: { classe: "bg-warning/15 text-warning", rotulo: "Em aberto" },
  vencida: { classe: "bg-destructive/10 text-destructive", rotulo: "Vencida" },
  estornada: { classe: "bg-muted text-muted-foreground", rotulo: "Estornada" },
  cancelada: { classe: "bg-muted text-muted-foreground", rotulo: "Cancelada" },
  erro: { classe: "bg-destructive/10 text-destructive", rotulo: "Erro de envio" },
};

const TIPOS: Record<string, string> = {
  base: "Mensalidades",
  sala_extra: "Salas extras",
  profissional_extra: "Profissionais extras",
  unidade_extra: "Unidades extras",
  prontuario_licenca: "Prontuário",
  ajuste: "Avulsas, parcelas e acréscimos",
};

const LIMITE_LISTA = 300;

function filtrosDe(p: Record<string, string | string[] | undefined>): FiltrosFaturas {
  const v = (k: string) => (typeof p[k] === "string" && p[k] ? String(p[k]).slice(0, 80) : undefined);
  return { status: v("status"), busca: v("busca"), de: v("de"), ate: v("ate") };
}

function Cartao({ titulo, valor, detalhe, icone }: { titulo: string; valor: string; detalhe: string; icone: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        {titulo} {icone}
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">{valor}</div>
      <span className="mt-1 block text-xs text-muted-foreground">{detalhe}</span>
    </div>
  );
}

export default async function FinanceiroPlataformaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, pode } = await acessoPlataforma();
  const filtros = filtrosDe(await searchParams);
  const painel = await obterPainelFinanceiro(usuario.id, filtros);
  const { resumo } = painel;
  const consulta = new URLSearchParams(Object.entries(filtros).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const podeFinanceiro = pode("financeiro.gerenciar");
  const totalTipos = Object.values(resumo.porTipo).reduce((a, b) => a + b, 0) || 1;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <DollarSign className="size-6 text-primary" /> Financeiro da plataforma
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Receita recorrente, recebimentos do mês, inadimplência e todas as faturas das clínicas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          titulo="MRR estimado"
          valor={formatarMoeda(painel.mrrCentavos)}
          detalhe={`${painel.pagantes} clínicas pagantes · ${painel.emTeste} em teste grátis`}
          icone={<TrendingUp className="size-4 text-primary" />}
        />
        <Cartao titulo="Recebido no mês" valor={formatarMoeda(resumo.recebidoNoMesCentavos)} detalhe="Pago pelo Asaas ou baixa manual" icone={<CheckCircle2 className="size-4 text-success" />} />
        <Cartao titulo="A receber no mês" valor={formatarMoeda(resumo.aReceberNoMesCentavos)} detalhe="Em aberto com vencimento neste mês" icone={<Clock className="size-4 text-warning" />} />
        <Cartao
          titulo="Descontos no mês"
          valor={formatarMoeda(resumo.descontosNoMesCentavos)}
          detalhe="Descontos, créditos e ajustes nas faturas do mês"
          icone={<BadgePercent className="size-4 text-primary" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="size-4 text-destructive" /> Inadimplência: {formatarMoeda(resumo.emAtrasoCentavos)}
          </h2>
          {(["1-15", "16-30", "31+"] as const).map((faixa) => (
            <div key={faixa} className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {faixa} dias em atraso ({resumo.atraso[faixa].quantidade})
              </span>
              <strong>{formatarMoeda(resumo.atraso[faixa].valorCentavos)}</strong>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-bold">Clínicas em atraso ({painel.pertoDaSuspensao.length})</h2>
          {painel.pertoDaSuspensao.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma clínica em atraso.</p>
          ) : (
            <ul className="divide-y text-xs">
              {painel.pertoDaSuspensao.map((c) => (
                <li key={c.tenantId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/plataforma/clinicas/${c.tenantId}?aba=cobranca`} className="font-semibold text-primary hover:underline">
                    {c.nome}
                  </Link>
                  <span className={c.estado === "suspensa" ? "font-semibold text-destructive" : "text-warning"}>
                    {"suspensaoEm" in c
                      ? c.estado === "suspensa"
                        ? `Só consulta desde ${formatarDataBr(c.suspensaoEm)}`
                        : `Suspende em ${formatarDataBr(c.suspensaoEm)} (venceu ${formatarDataBr(c.vencimento)})`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold">Receita por tipo (faturas emitidas)</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(resumo.porTipo).map(([tipo, valor]) => (
            <div key={tipo} className="text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{TIPOS[tipo] ?? tipo}</span>
                <strong>{formatarMoeda(valor)}</strong>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round((valor / totalTipos) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <form className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="ff-busca" className="text-xs">Clínica</Label>
          <Input id="ff-busca" name="busca" defaultValue={filtros.busca} placeholder="Nome da clínica" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ff-status" className="text-xs">Situação</Label>
          <NativeSelect id="ff-status" name="status" defaultValue={filtros.status ?? ""}>
            <option value="">Todas</option>
            <option value="aberta">Em aberto (inclui vencidas)</option>
            <option value="vencida">Vencidas</option>
            <option value="paga">Pagas</option>
            <option value="cancelada">Canceladas</option>
            <option value="erro">Erro de envio</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ff-de" className="text-xs">Vencimento de</Label>
          <Input id="ff-de" name="de" type="date" defaultValue={filtros.de} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ff-ate" className="text-xs">até</Label>
          <Input id="ff-ate" name="ate" type="date" defaultValue={filtros.ate} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/plataforma/financeiro/csv${consulta ? `?${consulta}` : ""}`}>
              <Download className="size-3.5" /> CSV
            </a>
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="border-b px-5 py-3 text-sm font-bold">
          Faturas ({painel.faturas.length}
          {painel.faturas.length > LIMITE_LISTA ? `, mostrando ${LIMITE_LISTA}; use os filtros ou o CSV` : ""})
        </div>
        {painel.faturas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
        ) : (
          <ul className="divide-y">
            {painel.faturas.slice(0, LIMITE_LISTA).map((f) => {
              const st = STATUS[f.status] ?? STATUS.pendente;
              return (
                <li key={f.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Link href={`/plataforma/clinicas/${f.tenantId}?aba=cobranca`} className="font-semibold text-foreground hover:underline">
                          {f.tenantNome}
                        </Link>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.classe}`}>{st.rotulo}</span>
                        {f.tipo !== "mensal" && <span className="text-[11px] text-muted-foreground">{f.tipo === "avulsa" ? "avulsa" : "parcela de acordo"}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {rotuloCompetencia(f.competencia)} · vence {formatarDataBr(f.vencimento)}
                        {f.pagoEm ? ` · paga em ${f.pagoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                        {f.formaBaixa === "manual" ? " (baixa manual)" : f.formaBaixa === "isenta" ? " (isenta)" : ""}
                        {f.observacao ? ` · ${f.observacao}` : ""}
                        {f.status === "erro" && f.ultimoErro ? ` · ${f.ultimoErro}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="tabular-nums">{formatarMoeda(f.valorCentavos)}</strong>
                      {f.invoiceUrl && (
                        <a href={f.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink className="size-3" /> Asaas
                        </a>
                      )}
                    </div>
                  </div>
                  {podeFinanceiro && <AcoesFatura fatura={{ id: f.id, tenantId: f.tenantId, status: f.status, vencimento: f.vencimento }} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
