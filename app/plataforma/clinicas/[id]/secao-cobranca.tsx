import { BadgePercent, HandCoins, Receipt, Settings2 } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DIA_DE_VENCIMENTO_SAAS, DIAS_DE_CARENCIA_SAAS } from "@/src/domain/cobranca";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { obterCobrancaDaClinica } from "@/src/server/plataforma-financeiro";
import { formatarDataBr } from "@/src/server/reservas";
import { rotuloCompetencia } from "@/app/painel/financeiro/componentes";
import { criarDescontoAcao, lancarCreditoAcao, revogarCreditoAcao, revogarDescontoAcao, salvarCondicoesAcao } from "./actions";

type Cobranca = Awaited<ReturnType<typeof obterCobrancaDaClinica>>;
type PrecosPlano = {
  precoMensalCentavos: number;
  precoSalaExtraCentavos: number;
  precoProfissionalExtraCentavos: number;
  precoUnidadeExtraCentavos: number;
  precoProntuarioCentavos: number;
};

function reais(centavos: number | null | undefined) {
  return centavos === null || centavos === undefined ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

function Bloco({ titulo, icone, children, descricao }: { titulo: string; icone: React.ReactNode; descricao?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          {icone} {titulo}
        </h3>
        {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}

/** Aba Cobrança da ficha da clínica: condições, descontos, créditos e prévia da próxima fatura. */
export function SecaoCobranca({ tenantId, cobranca, plano, podeEditar }: { tenantId: string; cobranca: Cobranca; plano: PrecosPlano; podeEditar: boolean }) {
  const c = cobranca.condicoes;
  const mesAtual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const camposPreco = [
    { nome: "precoMensal", rotulo: "Mensalidade", atual: c?.precoMensalCentavos, plano: plano.precoMensalCentavos },
    { nome: "precoSala", rotulo: "Sala extra", atual: c?.precoSalaExtraCentavos, plano: plano.precoSalaExtraCentavos },
    { nome: "precoProfissional", rotulo: "Profissional extra", atual: c?.precoProfissionalExtraCentavos, plano: plano.precoProfissionalExtraCentavos },
    { nome: "precoUnidade", rotulo: "Unidade extra", atual: c?.precoUnidadeExtraCentavos, plano: plano.precoUnidadeExtraCentavos },
    { nome: "precoProntuario", rotulo: "Prontuário (por profissional)", atual: c?.precoProntuarioCentavos, plano: plano.precoProntuarioCentavos },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco
        titulo="Próxima fatura (prévia)"
        icone={<Receipt className="size-4 text-primary" />}
        descricao="Como a fatura sairia hoje, com uso atual, condições, descontos e créditos."
      >
        {cobranca.proxima ? (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              Competência <strong className="text-foreground">{rotuloCompetencia(cobranca.proxima.competencia)}</strong> · vence em{" "}
              {formatarDataBr(cobranca.proxima.vencimento)}
            </p>
            <ul className="divide-y rounded-lg border">
              {cobranca.proxima.itens.map((it, i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
                  <span className="text-muted-foreground">{it.descricao}</span>
                  <strong className={it.valorTotalCentavos < 0 ? "text-success" : "text-foreground"}>{formatarMoeda(it.valorTotalCentavos)}</strong>
                </li>
              ))}
              <li className="flex justify-between bg-muted/40 px-3 py-1.5 font-bold">
                <span>Total</span>
                <span>{formatarMoeda(cobranca.proxima.valorTotalCentavos)}</span>
              </li>
            </ul>
            {cobranca.proxima.valorTotalCentavos === 0 && <p className="text-success">Fatura isenta: nasce quitada, sem cobrança no Asaas.</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem fatura prevista (plano gratuito).</p>
        )}
      </Bloco>

      <Bloco
        titulo="Condições negociadas"
        icone={<Settings2 className="size-4 text-primary" />}
        descricao="Vazio = segue o plano. Valem a partir da próxima fatura; faturas já emitidas não mudam."
      >
        {podeEditar ? (
          <FormAcao acao={salvarCondicoesAcao.bind(null, tenantId)} textoBotao="Salvar condições" className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {camposPreco.map((campo) => (
                <div key={campo.nome} className="flex flex-col gap-1.5">
                  <Label htmlFor={`cc-${campo.nome}`} className="text-xs">
                    {campo.rotulo} (R$)
                  </Label>
                  <Input id={`cc-${campo.nome}`} name={campo.nome} inputMode="decimal" defaultValue={reais(campo.atual)} placeholder={`Plano: ${reais(campo.plano)}`} />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-dia" className="text-xs">
                  Dia de vencimento (1 a 28)
                </Label>
                <Input id="cc-dia" name="diaVencimento" type="number" min={1} max={28} defaultValue={c?.diaVencimento ?? ""} placeholder={`Padrão: ${DIA_DE_VENCIMENTO_SAAS}`} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-carencia" className="text-xs">
                  Carência até suspender (dias)
                </Label>
                <Input id="cc-carencia" name="diasCarencia" type="number" min={0} max={90} defaultValue={c?.diasCarencia ?? ""} placeholder={`Padrão: ${DIAS_DE_CARENCIA_SAAS}`} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-obs" className="text-xs">
                Observação interna
              </Label>
              <Input id="cc-obs" name="observacao" maxLength={500} defaultValue={c?.observacao ?? ""} placeholder="Ex.: contrato anual negociado em out/2026" />
            </div>
          </FormAcao>
        ) : (
          <p className="text-xs text-muted-foreground">{c ? "Esta clínica tem condições negociadas." : "Segue o plano, sem condição negociada."}</p>
        )}
      </Bloco>

      <Bloco
        titulo="Descontos"
        icone={<BadgePercent className="size-4 text-primary" />}
        descricao="Percentual sobre a fatura ou valor fixo por mês, por um período (ou sem fim)."
      >
        {cobranca.descontos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum desconto.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-xs">
            {cobranca.descontos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex flex-col">
                  <strong className={d.revogadoEm ? "text-muted-foreground line-through" : "text-foreground"}>
                    {d.tipo === "percentual" ? `${d.valor}%` : `${formatarMoeda(d.valor)}/mês`} — {d.motivo}
                  </strong>
                  <span className="text-muted-foreground">
                    {rotuloCompetencia(d.competenciaInicio)} a {d.competenciaFim ? rotuloCompetencia(d.competenciaFim) : "sem prazo"}
                    {d.revogadoEm ? " · revogado" : d.vigenteNaProxima ? " · entra na próxima fatura" : ""}
                  </span>
                </span>
                {podeEditar && !d.revogadoEm && (
                  <FormAcao
                    acao={revogarDescontoAcao.bind(null, tenantId, d.id)}
                    textoBotao="Revogar"
                    textoPendente="…"
                    variante="outline"
                    confirmar="Revogar este desconto? Ele deixa de entrar nas próximas faturas."
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <FormAcao acao={criarDescontoAcao.bind(null, tenantId)} textoBotao="Dar desconto" className="flex flex-col gap-3 border-t pt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-tipo" className="text-xs">
                  Tipo
                </Label>
                <NativeSelect id="ds-tipo" name="tipo" defaultValue="percentual">
                  <option value="percentual">Percentual (%)</option>
                  <option value="valor">Valor fixo (R$/mês)</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-valor" className="text-xs">
                  Valor
                </Label>
                <Input id="ds-valor" name="valor" inputMode="decimal" required placeholder="20" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-motivo" className="text-xs">
                  Motivo
                </Label>
                <Input id="ds-motivo" name="motivo" required maxLength={200} placeholder="Ex.: parceria" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-inicio" className="text-xs">
                  A partir de
                </Label>
                <Input id="ds-inicio" name="inicio" type="month" required defaultValue={mesAtual} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-fim" className="text-xs">
                  Até (vazio = sem fim)
                </Label>
                <Input id="ds-fim" name="fim" type="month" />
              </div>
            </div>
          </FormAcao>
        )}
      </Bloco>

      <Bloco
        titulo="Créditos"
        icone={<HandCoins className="size-4 text-primary" />}
        descricao="Abatimento avulso (ex.: compensação). Abate das próximas faturas até o saldo acabar."
      >
        {cobranca.creditos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum crédito.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-xs">
            {cobranca.creditos.map((cr) => (
              <li key={cr.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex flex-col">
                  <strong className={cr.revogadoEm ? "text-muted-foreground line-through" : "text-foreground"}>
                    {formatarMoeda(cr.valorCentavos)} — {cr.motivo}
                  </strong>
                  <span className="text-muted-foreground">
                    Saldo {formatarMoeda(cr.saldoCentavos)} · lançado em {cr.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {cr.revogadoEm ? " · revogado" : ""}
                  </span>
                </span>
                {podeEditar && !cr.revogadoEm && cr.saldoCentavos > 0 && (
                  <FormAcao
                    acao={revogarCreditoAcao.bind(null, tenantId, cr.id)}
                    textoBotao="Revogar"
                    textoPendente="…"
                    variante="outline"
                    confirmar="Revogar o saldo restante deste crédito?"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <FormAcao acao={lancarCreditoAcao.bind(null, tenantId)} textoBotao="Lançar crédito" className="flex flex-col gap-3 border-t pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cr-valor" className="text-xs">
                  Valor (R$)
                </Label>
                <Input id="cr-valor" name="valor" inputMode="decimal" required placeholder="50,00" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cr-motivo" className="text-xs">
                  Motivo
                </Label>
                <Input id="cr-motivo" name="motivo" required maxLength={200} placeholder="Ex.: instabilidade em 12/10" />
              </div>
            </div>
          </FormAcao>
        )}
      </Bloco>
    </div>
  );
}
