import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarMoeda, formatarPercentual } from "@/src/domain/dinheiro";
import { pode } from "@/src/domain/rbac";
import { competenciaAnterior, NavCompetencia, rotuloCompetencia } from "../financeiro/componentes";
import { competenciaAtual, competenciaSchema } from "@/src/server/financeiro";
import { listarNotas, obterConfiguracaoFiscal, pendentesDeEmissao } from "@/src/server/fiscal";
import { cancelarNotaAcao, emitirNotaAcao, emitirNotasDoMesAcao, salvarConfiguracaoFiscalAcao } from "./actions";

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Aguardando envio", classe: "bg-muted" },
  processando: { rotulo: "Processando", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  autorizada: { rotulo: "Autorizada", classe: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" },
  erro: { rotulo: "Recusada", classe: "bg-destructive/15 text-destructive" },
  cancelada: { rotulo: "Cancelada", classe: "bg-muted text-muted-foreground line-through" },
};

const AMBIENTES = [
  ["simulado", "Simulado (nada é enviado)"],
  ["homologacao", "Homologação da Focus NFe (testes)"],
  ["producao", "Produção (notas com valor fiscal)"],
] as const;

export default async function FiscalPage({ searchParams }: PageProps<"/painel/fiscal">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "fiscal.ver");
  const brutos = await searchParams;
  const informada = typeof brutos.competencia === "string" ? competenciaSchema.safeParse(brutos.competencia) : null;
  // Padrão: mês anterior (o último que pode estar fechado).
  const competencia = informada?.success ? informada.data : competenciaAnterior(await competenciaAtual(ctx));
  const [{ config, cnpjPrestador, pendencias }, notas, pendentes] = await Promise.all([
    obterConfiguracaoFiscal(ctx),
    listarNotas(ctx, competencia),
    pendentesDeEmissao(ctx, competencia),
  ]);
  const podeEmitir = pode(ctx.role, "fiscal.emitir") && config?.ativo && pendencias.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notas fiscais (NFS-e)</h1>
          <p className="text-sm text-muted-foreground">
            Locação de {rotuloCompetencia(competencia)} · NFS-e Nacional via Focus NFe ·{" "}
            {config ? AMBIENTES.find(([v]) => v === config.ambiente)?.[1] : "não configurado"}
          </p>
        </div>
        <NavCompetencia competencia={competencia} href={(x) => `/painel/fiscal?competencia=${x}`} />
      </div>

      {pendencias.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base">Antes de emitir</CardTitle>
            <CardContent className="px-0">
              <ul className="list-disc pl-5 text-sm">
                {pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </CardContent>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>A emitir ({pendentes.length})</CardTitle>
          <CardDescription>Profissionais com o mês fechado, valor de locação e sem nota ativa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente nesta competência.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {pendentes.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {p.nome}
                      {!p.documento && <span className="ml-2 text-xs text-destructive">sem CPF/CNPJ</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatarMoeda(p.valorCentavos)}</span>
                      {podeEmitir && (
                        <FormAcao
                          acao={emitirNotaAcao.bind(null, p.id, competencia)}
                          textoBotao="Emitir"
                          textoPendente="Enviando…"
                          variante="outline"
                          className="flex items-center gap-2"
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {podeEmitir && pendentes.length > 1 && (
                <FormAcao
                  acao={emitirNotasDoMesAcao.bind(null, competencia)}
                  textoBotao={`Emitir todas (${pendentes.length})`}
                  textoPendente="Enviando…"
                  confirmar={`Emitir ${pendentes.length} notas de ${rotuloCompetencia(competencia)}?`}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notas de {rotuloCompetencia(competencia)}</CardTitle>
          <CardDescription>O status é atualizado automaticamente a cada 2 minutos.</CardDescription>
        </CardHeader>
        <CardContent>
          {notas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota.</p>
          ) : (
            <ul className="divide-y text-sm">
              {notas.map(({ nota, profissionalNome }) => (
                <li key={nota.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{profissionalNome}</span>
                      <span className="block text-xs text-muted-foreground">
                        DPS {nota.serieDps}/{nota.numeroDps}
                        {nota.numero && ` · NFS-e nº ${nota.numero}`}
                        {nota.ambiente !== "producao" && ` · ${nota.ambiente}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatarMoeda(nota.valorCentavos)}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[nota.status].classe}`}>{STATUS[nota.status].rotulo}</span>
                    </span>
                  </div>
                  {nota.erros && nota.erros.length > 0 && nota.status !== "autorizada" && (
                    <ul className="text-xs text-destructive">
                      {nota.erros.map((e, i) => (
                        <li key={i}>
                          {e.codigo && `${e.codigo}: `}
                          {e.mensagem}
                          {e.correcao && ` — ${e.correcao}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {nota.status === "cancelada" && nota.justificativaCancelamento && (
                    <p className="text-xs text-muted-foreground">Cancelada: {nota.justificativaCancelamento}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {nota.urlDanfse && (
                      <a href={nota.urlDanfse} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        DANFSe (PDF)
                      </a>
                    )}
                    {nota.url && (
                      <a href={nota.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        Consulta no portal nacional
                      </a>
                    )}
                  </div>
                  {nota.status === "autorizada" && pode(ctx.role, "fiscal.emitir") && (
                    <FormAcao
                      acao={cancelarNotaAcao.bind(null, nota.id)}
                      textoBotao="Cancelar nota"
                      textoPendente="Cancelando…"
                      variante="destructive"
                      confirmar="O cancelamento é definitivo. Continuar?"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input name="justificativa" placeholder="Justificativa (mín. 15 caracteres)" minLength={15} required className="h-7 max-w-sm" />
                    </FormAcao>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {pode(ctx.role, "fiscal.configurar") && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração fiscal do espaço</CardTitle>
            <CardDescription>
              Prestador: CNPJ {cnpjPrestador ? cnpjPrestador.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—"}. Confira os códigos
              com a sua contabilidade. O token da Focus NFe é guardado cifrado e nunca é exibido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao acao={salvarConfiguracaoFiscalAcao} textoBotao="Salvar configuração">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-ambiente">Ambiente</Label>
                  <NativeSelect id="fi-ambiente" name="ambiente" defaultValue={config?.ambiente ?? "simulado"}>
                    {AMBIENTES.map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="fi-token">Token da Focus NFe {config?.tokenConfigurado && "(configurado — deixe vazio para manter)"}</Label>
                  <Input id="fi-token" name="token" type="password" autoComplete="off" placeholder={config?.tokenConfigurado ? "••••••••" : "token da empresa na Focus"} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-municipio">Código IBGE do município</Label>
                  <Input id="fi-municipio" name="codigoMunicipio" inputMode="numeric" placeholder="3550308" defaultValue={config?.codigoMunicipio ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-im">Inscrição municipal</Label>
                  <Input id="fi-im" name="inscricaoMunicipal" defaultValue={config?.inscricaoMunicipal ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-trib">Cód. tributação nacional (ISSQN)</Label>
                  <Input id="fi-trib" name="codigoTributacao" inputMode="numeric" placeholder="6 dígitos" defaultValue={config?.codigoTributacaoNacional ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-simples">Simples Nacional</Label>
                  <NativeSelect id="fi-simples" name="opcaoSimples" defaultValue={String(config?.opcaoSimplesNacional ?? 3)}>
                    <option value="1">Não optante</option>
                    <option value="2">MEI</option>
                    <option value="3">ME/EPP</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-regime-sn">Regime de apuração (Simples)</Label>
                  <NativeSelect id="fi-regime-sn" name="regimeSimples" defaultValue={config?.regimeTributarioSimplesNacional ? String(config.regimeTributarioSimplesNacional) : ""}>
                    <option value="">—</option>
                    <option value="1">1 · tributos federais e municipal pelo SN</option>
                    <option value="2">2 · federais pelo SN, ISSQN por fora</option>
                    <option value="3">3 · federais e ISSQN por fora</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-aliquota">Alíquota do ISS (%)</Label>
                  <Input
                    id="fi-aliquota"
                    name="aliquota"
                    inputMode="decimal"
                    placeholder="opcional"
                    defaultValue={config?.aliquotaIssBp ? formatarPercentual(config.aliquotaIssBp).replace("%", "") : ""}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-nbs">Código NBS</Label>
                  <Input id="fi-nbs" name="codigoNbs" inputMode="numeric" placeholder="opcional, 9 dígitos" defaultValue={config?.codigoNbs ?? ""} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-regime-esp">Regime especial</Label>
                  <Input id="fi-regime-esp" name="regimeEspecial" type="number" min={0} max={9} defaultValue={config?.regimeEspecialTributacao ?? 0} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fi-serie">Série da DPS</Label>
                  <Input id="fi-serie" name="serieDps" type="number" min={1} defaultValue={config?.serieDps ?? 1} />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-3">
                  <Label htmlFor="fi-desc">Descrição do serviço</Label>
                  <Input id="fi-desc" name="descricaoServico" defaultValue={config?.descricaoServico ?? "Cessão de uso de sala para atendimento"} required />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ativo" defaultChecked={config?.ativo ?? false} /> Emissão de NFS-e ativa
              </label>
              {config && <p className="text-xs text-muted-foreground">Próximo número de DPS: {config.proximoNumeroDps}</p>}
            </FormAcao>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
