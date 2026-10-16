import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda, formatarPercentual } from "@/src/domain/dinheiro";
import { proximaCompetencia, ROTULOS_MODELO, type Acordo } from "@/src/domain/financeiro";
import { pode } from "@/src/domain/rbac";
import { hojeNoFuso } from "@/src/domain/tempo";
import { competenciaAtual, competenciaSchema, extrato, listarAcordos, listarPagamentos } from "@/src/server/financeiro";
import { formatarDataBr } from "@/src/server/reservas";
import { criarAcordoAcao, fecharCompetenciaAcao, lancarAjusteAcao, registrarPagamentoAcao } from "../actions";
import { NavCompetencia, rotuloCompetencia, Saldo, TabelaExtrato } from "../componentes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function descreverAcordo(a: Acordo): string {
  const partes: string[] = [ROTULOS_MODELO[a.modelo]];
  if (a.modelo === "hora" && a.valorHoraCentavos) partes.push(`${formatarMoeda(a.valorHoraCentavos)}/h`);
  if (a.modelo === "consulta" && a.valorConsultaCentavos) partes.push(`${formatarMoeda(a.valorConsultaCentavos)} por consulta`);
  if (a.modelo === "percentual" && a.percentualBp) partes.push(formatarPercentual(a.percentualBp));
  if (a.modelo === "mensalidade" && a.mensalidadeCentavos) {
    partes.push(`${formatarMoeda(a.mensalidadeCentavos)}/mês com ${a.horasIncluidas}h`);
    if (a.valorHoraCentavos) partes.push(`excedente ${formatarMoeda(a.valorHoraCentavos)}/h`);
  }
  partes.push(a.fluxoRecebimento === "centralizado" ? "caixa centralizado" : "paciente paga direto");
  partes.push(
    a.regraFalta === "isenta"
      ? "falta isenta"
      : a.regraFalta === "integral"
        ? "falta cobrada integral"
        : `falta cobrada ${formatarPercentual(a.faltaPercentualBp ?? 0)}`,
  );
  return partes.join(" · ");
}

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
  const [acordos, pagamentosRecentes] = await Promise.all([
    admin ? listarAcordos(ctx, profissionalId) : Promise.resolve([]),
    listarPagamentos(ctx, profissionalId),
  ]);
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
          <p className="text-sm text-muted-foreground">{dados.acordo ? descreverAcordo(dados.acordo) : "Sem acordo vigente nesta competência"}</p>
        </div>
        <NavCompetencia competencia={competencia} href={(x) => `/painel/financeiro/${profissionalId}?competencia=${x}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Extrato de {rotuloCompetencia(competencia)}</CardTitle>
          <CardDescription>
            {dados.fechamento?.fechadoEm
              ? `Fechado em ${dados.fechamento.fechadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
              : "Competência aberta: os valores ainda podem mudar."}{" "}
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
                  <Label htmlFor="pg-direcao">Sentido</Label>
                  <NativeSelect id="pg-direcao" name="direcao" defaultValue={dados.saldoFinal < 0 ? "espaco_para_profissional" : "profissional_para_espaco"}>
                    <option value="profissional_para_espaco">Profissional pagou ao espaço</option>
                    <option value="espaco_para_profissional">Espaço repassou ao profissional</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pg-valor">Valor (R$)</Label>
                  <Input id="pg-valor" name="valor" inputMode="decimal" placeholder="0,00" defaultValue={dados.saldoFinal ? (Math.abs(dados.saldoFinal) / 100).toFixed(2).replace(".", ",") : ""} required />
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
              <FormAcao acao={lancarAjusteAcao.bind(null, profissionalId)} textoBotao="Lançar ajuste">
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
                    <Input id="aj-valor" name="valor" inputMode="decimal" placeholder="0,00" required />
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

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>Acordo financeiro</CardTitle>
            <CardDescription>
              Um novo acordo vale a partir da data informada e encerra o anterior na véspera (reajuste). Os meses passados não
              mudam.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {acordos.length > 0 && (
              <ul className="divide-y text-sm">
                {acordos.map((a) => (
                  <li key={a.id} className="flex flex-col py-2">
                    <span>{descreverAcordo(a)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatarDataBr(a.vigenteDe)} → {a.vigenteAte ? formatarDataBr(a.vigenteAte) : "sem data de término"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <FormAcao acao={criarAcordoAcao.bind(null, profissionalId)} textoBotao="Salvar acordo">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-modelo">Modelo de cobrança</Label>
                  <NativeSelect id="ac-modelo" name="modelo" defaultValue={dados.acordo?.modelo ?? "hora"}>
                    {Object.entries(ROTULOS_MODELO).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-fluxo">Recebimento do paciente</Label>
                  <NativeSelect id="ac-fluxo" name="fluxoRecebimento" defaultValue={dados.acordo?.fluxoRecebimento ?? "direto"}>
                    <option value="direto">Paciente paga direto ao profissional</option>
                    <option value="centralizado">Caixa centralizado (paga ao espaço)</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-vigencia">Vale a partir de</Label>
                  <Input id="ac-vigencia" name="vigenteDe" type="date" defaultValue={`${atual.slice(0, 7)}-01`} required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-hora">Valor da hora (R$)</Label>
                  <Input id="ac-hora" name="valorHora" inputMode="decimal" placeholder="hora / excedente" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-consulta">Valor por consulta (R$)</Label>
                  <Input id="ac-consulta" name="valorConsulta" inputMode="decimal" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-pct">Percentual do atendimento (%)</Label>
                  <Input id="ac-pct" name="percentual" inputMode="decimal" placeholder="30" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-mensal">Mensalidade (R$)</Label>
                  <Input id="ac-mensal" name="mensalidade" inputMode="decimal" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-horas">Horas incluídas no pacote</Label>
                  <Input id="ac-horas" name="horasIncluidas" type="number" min={0} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-falta">Falta / cancelamento tardio</Label>
                  <NativeSelect id="ac-falta" name="regraFalta" defaultValue={dados.acordo?.regraFalta ?? "isenta"}>
                    <option value="isenta">Isenta</option>
                    <option value="integral">Cobra integral</option>
                    <option value="percentual">Cobra percentual</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ac-falta-pct">% cobrado na falta</Label>
                  <Input id="ac-falta-pct" name="faltaPercentual" inputMode="decimal" placeholder="50" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Preencha só os campos do modelo escolhido. No modelo percentual com pagamento direto, o valor do atendimento é
                declarado pelo profissional/recepção e fica registrado na auditoria.
              </p>
            </FormAcao>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
