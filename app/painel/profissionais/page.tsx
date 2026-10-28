import Link from "next/link";
import { InputMascara } from "@/components/input-mascara";
import { pode } from "@/src/domain/rbac";
import { DecisaoReservas } from "@/components/decisao-reservas";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { obterContextoTenant } from "@/src/auth/sessao";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { formatarMoeda } from "@/src/domain/dinheiro";
import type { EstadoLicencaProntuario } from "@/src/domain/cobranca";
import { precoProntuarioDoPlano } from "@/src/server/assinatura";
import { CONSELHOS, listarProfissionais, type SituacaoAcesso } from "@/src/server/profissionais";
import { atualizarProfissionalAcao, criarProfissionalAcao, gerarConviteAcao } from "./actions";
import { BotaoConvite } from "./botao-convite";

const ROTULO_SITUACAO: Record<SituacaoAcesso, string> = {
  ativo: "Acesso ativo",
  convite_pendente: "Convite pendente",
  sem_acesso: "Sem acesso",
};

const ROTULO_LICENCA: Record<EstadoLicencaProntuario, string> = {
  inativa: "Prontuário: não ativo",
  teste: "Prontuário: 15 dias grátis",
  ativa: "Prontuário ativo",
  aguardando_pagamento: "Prontuário: pagamento vencido",
};

export default async function ProfissionaisPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "profissionais.gerenciar");
  const [profissionais, precoProntuario] = await Promise.all([listarProfissionais(ctx), precoProntuarioDoPlano(ctx)]);
  const podeDesativar = pode(ctx.role, "profissionais.desativar");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Profissionais</CardTitle>
          <CardDescription>
            Locatários das salas. O convite gera um link (válido por 7 dias) para o profissional criar o acesso com o
            e-mail cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profissionais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado.</p>}
          {profissionais.map((p) => (
            <details key={p.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{p.nome}</span>
                  {!p.ativo && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                  <span className="block text-xs text-muted-foreground">
                    {[p.especialidade, p.conselho && `${p.conselho} ${p.registro ?? ""}`.trim(), p.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">{ROTULO_SITUACAO[p.situacao]}</span>
                  {p.prontuario.estado !== "inativa" ? (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {ROTULO_LICENCA[p.prontuario.estado]}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/80">
                      Prontuário: não ativo
                    </span>
                  )}
                </div>
              </summary>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                  <span>
                    Módulo Prontuário EHR:{" "}
                    <strong className="text-foreground">
                      {ROTULO_LICENCA[p.prontuario.estado]}
                      {p.prontuario.estado !== "inativa" && p.prontuario.responsavel === "espaco" && " · paga pelo espaço"}
                      {p.prontuario.estado !== "inativa" && p.prontuario.responsavel === "profissional" && " · paga pelo profissional"}
                      {p.prontuario.estado === "inativa" && ` · ${formatarMoeda(precoProntuario)}/mês depois de 15 dias grátis`}
                    </strong>
                  </span>
                  <Link href="/painel/assinatura" className="font-medium text-primary hover:underline">
                    Gerenciar licenças na Assinatura →
                  </Link>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">Ações Rápidas:</span>
                    <span className="ml-1 text-muted-foreground">Configure os valores de locação de sala ou libere acesso ao sistema.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs font-semibold">
                      <Link href={`/painel/contratos/novo?profissional=${p.id}`}>
                        Contrato & Valores de Sala →
                      </Link>
                    </Button>
                  </div>
                </div>

                <FormAcao acao={atualizarProfissionalAcao.bind(null, p.id)} textoBotao="Salvar">
                  <CamposProfissional valores={p} prefixo={p.id} emailBloqueado={p.situacao === "ativo"} />
                  {podeDesativar ? (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo (inativar também remove o acesso)
                      </label>
                      {p.ativo && <DecisaoReservas id={`prof-${p.id}-decisao`} rotulo="Ao inativar, reservas futuras dele" />}
                    </>
                  ) : (
                    // A recepção edita o cadastro; ativar e inativar ficam com o admin.
                    p.ativo && <input type="hidden" name="ativo" value="on" />
                  )}
                </FormAcao>
                {p.situacao !== "ativo" && p.ativo && (
                  <BotaoConvite acao={gerarConviteAcao.bind(null, p.id)} pendente={p.situacao === "convite_pendente"} nomeProfissional={p.nome} />
                )}
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAcao acao={criarProfissionalAcao} textoBotao="Cadastrar">
            <CamposProfissional prefixo="novo" />
          </FormAcao>
        </CardContent>
      </Card>
    </main>
  );
}

type Valores = {
  nome?: string;
  email?: string;
  telefone?: string | null;
  conselho?: string | null;
  registro?: string | null;
  especialidade?: string | null;
  documento?: string | null;
};

function CamposProfissional({
  valores = {},
  prefixo,
  emailBloqueado = false,
}: {
  valores?: Valores;
  prefixo: string;
  emailBloqueado?: boolean;
}) {
  const campo = (nome: string) => `${prefixo}-${nome}`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("nome")}>Nome</Label>
        <Input id={campo("nome")} name="nome" defaultValue={valores.nome} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("email")}>E-mail</Label>
        <Input
          id={campo("email")}
          name="email"
          type="email"
          defaultValue={valores.email}
          readOnly={emailBloqueado}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("telefone")}>Telefone / WhatsApp</Label>
        <InputMascara mascara="telefone" id={campo("telefone")} name="telefone" type="tel" defaultValue={valores.telefone ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("conselho")}>Conselho</Label>
        <NativeSelect id={campo("conselho")} name="conselho" defaultValue={valores.conselho ?? ""}>
          <option value="">—</option>
          {CONSELHOS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("registro")}>Nº de registro</Label>
        <Input id={campo("registro")} name="registro" defaultValue={valores.registro ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("especialidade")}>Especialidade</Label>
        <Input id={campo("especialidade")} name="especialidade" defaultValue={valores.especialidade ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={campo("documento")}>CPF ou CNPJ (para a NFS-e)</Label>
        <InputMascara mascara="cpfCnpj" id={campo("documento")} name="documento" defaultValue={valores.documento ?? ""} />
      </div>
    </div>
  );
}
