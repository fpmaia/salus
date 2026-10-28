import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, Sparkles } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirModuloNaPagina, exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { AcoesLicencaProntuario } from "@/components/acoes-licenca-prontuario";
import { obterStatusLicencaProntuarioProfissional } from "@/src/server/assinatura";
import { ErroNegocio } from "@/src/server/erros";
import { horarioLocal, obterProntuario, type RegistroLido } from "@/src/server/prontuario";
import { formatarDataBr } from "@/src/server/reservas";
import {
  compartilharAcao,
  criarAdendoAcao,
  descartarRascunhoAcao,
  finalizarRegistroAcao,
  revogarAcao,
  salvarRascunhoAcao,
} from "../actions";
import { AnexoUpload } from "../anexo-upload";
import { ConteudoRegistro } from "../registros";
import { EditorRegistroComModelos } from "../editor-registro-com-modelos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const textarea =
  "min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function ProntuarioPacientePage({ params }: PageProps<"/painel/prontuario/[pacienteId]">) {
  const { pacienteId } = await params;
  const ctx = await obterContextoTenant();
  await exigirModuloNaPagina(ctx, "prontuario");
  exigirPermissaoNaPagina(ctx.role, "prontuario.proprio");
  if (!UUID.test(pacienteId)) notFound();
  const statusLicenca = await obterStatusLicencaProntuarioProfissional(ctx);
  const dados = await obterProntuario(ctx, pacienteId).catch((erro) => {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  });
  const { paciente, registros, compartilhamentos, colegas, atendimentos } = dados;
  const evolucoes = registros.filter((r) => r.tipo === "evolucao").reverse();
  const adendosDe = (id: string) => registros.filter((r) => r.adendoDe === id);
  const rascunhosDeAdendo = registros.filter((r) => r.tipo === "adendo" && r.status === "rascunho" && r.proprio);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      {statusLicenca.possuiPerfilProfissional && statusLicenca.emTrial && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              <strong>Degustação Gratuita:</strong> Restam {statusLicenca.diasRestantes} dias de teste grátis do Prontuário Eletrônico
              {statusLicenca.trialFimEm ? ` (até ${formatarDataBr(statusLicenca.trialFimEm.toISOString().slice(0, 10))})` : ""}.
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold">
            <Clock className="size-3" /> Teste Grátis
          </span>
        </div>
      )}

      {statusLicenca.possuiPerfilProfissional && !statusLicenca.podeEscrever && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-800 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            {statusLicenca.estado === "aguardando_pagamento"
              ? "O pagamento do seu prontuário venceu. Você pode consultar o histórico, mas novas evoluções, adendos e anexos aguardam o pagamento."
              : "Seu prontuário eletrônico não está ativo. Você pode consultar o histórico, mas novas evoluções exigem ativar a licença."}
          </span>
          <AcoesLicencaProntuario status={statusLicenca} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/painel/prontuario" className="text-sm text-muted-foreground hover:underline">
            ← Prontuário
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{paciente.nome}</h1>
          {paciente.dataNascimento && <p className="text-sm text-muted-foreground">Nascimento: {formatarDataBr(paciente.dataNascimento)}</p>}
        </div>
        <Link href={`/painel/prontuario/${pacienteId}/imprimir`} target="_blank" className="text-sm text-primary underline-offset-4 hover:underline">
          Imprimir / PDF
        </Link>
      </div>

      {(!statusLicenca.possuiPerfilProfissional || statusLicenca.podeEscrever) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova evolução ou relatório clínico</CardTitle>
            <CardDescription>
              Anotação livre ou modelos com 1 clique (CFP nº 06/2019, Escolar, Encaminhamento). Salva como rascunho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditorRegistroComModelos acao={salvarRascunhoAcao.bind(null, pacienteId, undefined)} atendimentos={atendimentos} />
          </CardContent>
        </Card>
      )}

      {rascunhosDeAdendo.map((r) => (
        <Card key={r.id} className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">Adendo em rascunho</CardTitle>
          </CardHeader>
          <CardContent>
            <AcoesRascunho registro={r} pacienteId={pacienteId} atendimentos={[]} />
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-col gap-4">
        {evolucoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>}
        {evolucoes.map((r) => (
          <Card key={r.id} className={r.status === "rascunho" ? "border-warning/40" : undefined}>
            <CardContent className="flex flex-col gap-4">
              {r.status === "rascunho" ? (
                <AcoesRascunho registro={r} pacienteId={pacienteId} atendimentos={atendimentos} />
              ) : (
                <>
                  <ConteudoRegistro registro={r} />
                  {adendosDe(r.id)
                    .filter((a) => a.status === "finalizado")
                    .map((a) => (
                      <div key={a.id} className="border-l-2 pl-3">
                        <ConteudoRegistro registro={a} />
                      </div>
                    ))}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs">
                    <span className="text-muted-foreground text-[11px]">Registro com assinatura eletrônica</span>
                    <Link
                      href={`/painel/prontuario/${pacienteId}/imprimir/${r.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      📄 Imprimir este Relatório / Laudo →
                    </Link>
                  </div>
                  {r.proprio && (
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">Incluir adendo (correção ou complemento)</summary>
                      <div className="mt-3">
                        <FormAcao acao={criarAdendoAcao.bind(null, r.id)} textoBotao="Criar adendo">
                          <textarea name="anotacoes" className={textarea} placeholder="Texto do adendo" aria-label="Texto do adendo" />
                          <input type="hidden" name="prescricao" value="" />
                        </FormAcao>
                      </div>
                    </details>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compartilhamento</CardTitle>
          <CardDescription>
            Libera os seus registros finalizados deste paciente para outro profissional do espaço. Exige consentimento do paciente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {compartilhamentos.length > 0 && (
            <ul className="divide-y text-sm">
              {compartilhamentos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {c.paraNome}
                    <span className="block text-xs text-muted-foreground">
                      {c.consentimento} · desde {horarioLocal(c.criadoEm)}
                      {c.revogadoEm && ` · revogado em ${horarioLocal(c.revogadoEm)}`}
                    </span>
                  </span>
                  {!c.revogadoEm && (
                    <FormAcao
                      acao={revogarAcao.bind(null, c.id)}
                      textoBotao="Revogar"
                      textoPendente="…"
                      variante="outline"
                      confirmar="Revogar o acesso deste profissional?"
                      className="flex items-center gap-2"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {colegas.length > 0 && (
            <FormAcao acao={compartilharAcao.bind(null, pacienteId)} textoBotao="Compartilhar" textoPendente="…">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cp-para">Profissional</Label>
                  <NativeSelect id="cp-para" name="paraProfissionalId" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {colegas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cp-cons">Como o consentimento foi obtido</Label>
                  <Input id="cp-cons" name="consentimento" minLength={10} required placeholder="Termo assinado em …" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirmo" required /> Confirmo que o paciente consentiu com o compartilhamento
              </label>
            </FormAcao>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

type Atendimento = { id: string; status: string; inicio: Date };

function AcoesRascunho({ registro, pacienteId, atendimentos }: { registro: RegistroLido; pacienteId: string; atendimentos: Atendimento[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Rascunho {registro.tipo === "adendo" ? "de adendo " : ""}criado em {horarioLocal(registro.criadoEm)} — só você vê.
      </p>
      {registro.tipo === "adendo" ? (
        <ConteudoRegistro registro={registro} />
      ) : (
        <EditorRegistroComModelos acao={salvarRascunhoAcao.bind(null, pacienteId, registro.id)} atendimentos={atendimentos} registro={registro} />
      )}
      {registro.tipo !== "adendo" && registro.anexos.length > 0 && <ConteudoAnexos registro={registro} />}
      <AnexoUpload registroId={registro.id} />
      <div className="flex flex-wrap gap-2">
        <FormAcao
          acao={finalizarRegistroAcao.bind(null, registro.id)}
          textoBotao="Finalizar"
          textoPendente="Finalizando…"
          confirmar="Depois de finalizado, o registro não pode mais ser alterado (só por adendo). Finalizar?"
          className="flex items-center gap-2"
        />
        <FormAcao
          acao={descartarRascunhoAcao.bind(null, registro.id)}
          textoBotao="Descartar"
          textoPendente="…"
          variante="destructive"
          confirmar="Descartar este rascunho?"
          className="flex items-center gap-2"
        />
      </div>
    </div>
  );
}

function ConteudoAnexos({ registro }: { registro: RegistroLido }) {
  return (
    <ul className="flex flex-wrap gap-3 text-xs">
      {registro.anexos.map((a) => (
        <li key={a.id}>
          <a href={`/api/prontuario/anexos/${a.id}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            📎 {a.nome}
          </a>
        </li>
      ))}
    </ul>
  );
}
