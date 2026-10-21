import { InputMascara } from "@/components/input-mascara";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { proximaCompetencia } from "@/src/domain/financeiro";
import { pode } from "@/src/domain/rbac";
import { hojeNoFuso } from "@/src/domain/tempo";
import { competenciaAtual, competenciaSchema, extrato, listarPagamentos } from "@/src/server/financeiro";
import { listarContratos } from "@/src/server/contratos";
import { descreverCondicoes } from "@/src/domain/contratos";
import { listarCobrancas, obterConfigCobranca } from "@/src/server/cobrancas";
import { listarNotas } from "@/src/server/fiscal";
import { formatarDataBr } from "@/src/server/reservas";
import { fecharCompetenciaAcao, lancarAjusteAcao, registrarPagamentoAcao } from "../actions";
import { FormCobranca, ListaCobrancas } from "../cobrancas-ui";
import { NavCompetencia, rotuloCompetencia, Saldo, TabelaExtrato } from "../componentes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FinanceiroProfissionalPage({ params, searchParams }: PageProps<"/painel/financeiro/[profissionalId]">) {
  const { profissionalId } = await params;
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "financeiro.ver");
  if (!UUID.test(profissionalId)) notFound();
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  const atual = await competenciaAtual(ctx);
  const competencia = informada?.success ? informada.data : atual;
  const admin = pode(ctx.role, "acordos.gerenciar");

  const dados = await extrato(ctx, { profissionalId, competencia }).catch(() => null);
  if (!dados) notFound();
  const [contratos, pagamentosRecentes, todasNotas] = await Promise.all([
    pode(ctx.role, "contratos.ver") ? listarContratos(ctx, { profissionalId }) : Promise.resolve([]),
    listarPagamentos(ctx, profissionalId),
    pode(ctx.role, "fiscal.ver") ? listarNotas(ctx, competencia) : Promise.resolve([]),
  ]);
  const notas = todasNotas.filter((n) => n.nota.profissionalId === profissionalId);
  const gerenciaCobranca = pode(ctx.role, "cobrancas.gerenciar");
  const [configCobranca, cobrancas] = gerenciaCobranca
    ? await Promise.all([obterConfigCobranca(ctx), listarCobrancas(ctx, profissionalId)])
    : [null, []];
  const hoje = hojeNoFuso("America/Sao_Paulo");
  const podeFechar = pode(ctx.role, "financeiro.fechar") && !dados.fechamento?.fechadoEm && proximaCompetencia(competencia) <= atual;
  const c = competencia.slice(0, 7);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/painel/financeiro?competencia=${c}`} className="text-sm text-muted-foreground hover:underline">
            ← Financeiro
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{dados.profissional.nome}</h1>
          <p className="text-sm text-muted-foreground">{dados.acordo ? descreverCondicoes(dados.acordo).slice(0, 2).join(" · ") : "Sem contrato vigente neste mês"}</p>
        </div>
        <NavCompetencia competencia={competencia} href={(x) => `/painel/financeiro/${profissionalId}?competencia=${x}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Extrato de {rotuloCompetencia(competencia)}</CardTitle>
          <CardDescription>
            {dados.fechamento?.fechadoEm
              ? `Fechado em ${dados.fechamento.fechadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
              : "Mês em aberto: os valores ainda podem mudar."}{" "}
            Saldo final: <Saldo centavos={dados.saldoFinal} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TabelaExtrato linhas={dados.linhas} saldoAnterior={dados.saldoAnterior} saldoFinal={dados.saldoFinal} />
          {podeFechar && (
            <FormAcao
              acao={fecharCompetenciaAcao.bind(null, profissionalId, competencia)}
              textoBotao={`Fechar ${rotuloCompetencia(competencia)}`}
              textoPendente="Fechando…"
              confirmar="Depois de fechado, o mês não aceita alterações (correções caem no mês seguinte). Fechar?"
            />
          )}
        </CardContent>
      </Card>

      {notas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nota fiscal de {rotuloCompetencia(competencia)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {notas.map(({ nota }) => (
                <li key={nota.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {nota.numero ? `NFS-e nº ${nota.numero}` : `DPS ${nota.serieDps}/${nota.numeroDps}`} · {formatarMoeda(nota.valorCentavos)}
                    <span className="ml-2 text-xs text-muted-foreground">{nota.status}</span>
                  </span>
                  {nota.urlDanfse && nota.status === "autorizada" && (
                    <a href={nota.urlDanfse} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      Baixar DANFSe
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {gerenciaCobranca && (
        <Card>
          <CardHeader>
            <CardTitle>Cobrança via Asaas</CardTitle>
            <CardDescription>
              {configCobranca?.ativo
                ? "Envie PIX/boleto ao profissional; o pagamento confirmado baixa o saldo sozinho."
                : "Ative a cobrança automática em Financeiro para cobrar por PIX/boleto."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {configCobranca?.ativo && <FormCobranca profissionalId={profissionalId} competencia={competencia} valorSugerido={dados.saldoFinal} />}
            <ListaCobrancas cobrancas={cobrancas} gerenciar />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registrar pagamento</CardTitle>
            <CardDescription>Baixa manual (PIX, dinheiro, transferência…).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormAcao acao={registrarPagamentoAcao.bind(null, profissionalId)} textoBotao="Registrar">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-2">
                  <Label htmlFor="pg-direcao">Quem pagou</Label>
                  <NativeSelect id="pg-direcao" name="direcao" defaultValue={dados.saldoFinal < 0 ? "espaco_para_profissional" : "profissional_para_espaco"}>
                    <option value="profissional_para_espaco">Profissional pagou ao espaço</option>
                    <option value="espaco_para_profissional">Espaço repassou ao profissional</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pg-valor">Valor (R$)</Label>
                  <InputMascara mascara="moeda" id="pg-valor" name="valor" placeholder="0,00" defaultValue={dados.saldoFinal ? (Math.abs(dados.saldoFinal) / 100).toFixed(2).replace(".", ",") : ""} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pg-data">Data</Label>
                  <Input id="pg-data" name="data" type="date" defaultValue={hoje} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pg-forma">Forma</Label>
                  <NativeSelect id="pg-forma" name="forma" defaultValue="pix">
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao">Cartão</option>
                    <option value="transferencia">Transferência</option>
                    <option value="boleto">Boleto</option>
                    <option value="outro">Outro</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pg-obs">Observação</Label>
                  <Input id="pg-obs" name="observacao" maxLength={200} />
                </div>
              </div>
            </FormAcao>
            {pagamentosRecentes.length > 0 && (
              <ul className="divide-y border-t text-sm">
                {pagamentosRecentes.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>
                      {formatarDataBr(p.data)} · {p.direcao === "profissional_para_espaco" ? "Recebido" : "Repassado"} ({p.forma})
                    </span>
                    <span className="tabular-nums">{formatarMoeda(p.valorCentavos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {pode(ctx.role, "financeiro.ajustar") && (
          <Card>
            <CardHeader>
              <CardTitle>Ajuste manual</CardTitle>
              <CardDescription>Descontos, multas ou correções que não vêm da agenda.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormAcao acao={lancarAjusteAcao.bind(null, profissionalId)} textoBotao="Fazer ajuste">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aj-natureza">Tipo</Label>
                    <NativeSelect id="aj-natureza" name="natureza" defaultValue="credito">
                      <option value="credito">Crédito (reduz o que ele deve)</option>
                      <option value="debito">Débito (aumenta o que ele deve)</option>
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aj-valor">Valor (R$)</Label>
                    <InputMascara mascara="moeda" id="aj-valor" name="valor" placeholder="0,00" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aj-data">Data</Label>
                    <Input id="aj-data" name="data" type="date" defaultValue={hoje} required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="aj-desc">Descrição</Label>
                    <Input id="aj-desc" name="descricao" maxLength={200} required />
                  </div>
                </div>
              </FormAcao>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contrato</CardTitle>
          <CardDescription>Preço, regras de falta e de cancelamento e grade fixa ficam no contrato do profissional.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {contratos.length === 0 ? (
            <p className="text-muted-foreground">Sem contrato: as reservas e consultas deste profissional não geram cobrança.</p>
          ) : (
            <ul className="divide-y">
              {contratos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/painel/contratos/${c.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                    {c.codigo}
                  </Link>
                  <span className="text-muted-foreground">{c.resumo}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatarDataBr(c.vigenteDe)} → {c.vigenteAte ? formatarDataBr(c.vigenteAte) : "sem término"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {admin && (
            <Link href={`/painel/contratos/novo?profissional=${profissionalId}`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
              {contratos.length ? "Reajustar contrato (nova versão)" : "Criar contrato"}
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
