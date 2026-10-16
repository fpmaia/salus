import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { obterContextoTenant } from "@/src/auth/sessao";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { CONSELHOS, listarProfissionais, type SituacaoAcesso } from "@/src/server/profissionais";
import { atualizarProfissionalAcao, criarProfissionalAcao, gerarConviteAcao } from "./actions";
import { BotaoConvite } from "./botao-convite";

const ROTULO_SITUACAO: Record<SituacaoAcesso, string> = {
  ativo: "Acesso ativo",
  convite_pendente: "Convite pendente",
  sem_acesso: "Sem acesso",
};

export default async function ProfissionaisPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "profissionais.gerenciar");
  const profissionais = await listarProfissionais(ctx);

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
                <span className="text-xs text-muted-foreground">{ROTULO_SITUACAO[p.situacao]}</span>
              </summary>
              <div className="mt-4 flex flex-col gap-4">
                <FormAcao acao={atualizarProfissionalAcao.bind(null, p.id)} textoBotao="Salvar">
                  <CamposProfissional valores={p} prefixo={p.id} emailBloqueado={p.situacao === "ativo"} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo (inativar também remove o acesso)
                  </label>
                </FormAcao>
                {p.situacao !== "ativo" && p.ativo && (
                  <BotaoConvite acao={gerarConviteAcao.bind(null, p.id)} pendente={p.situacao === "convite_pendente"} />
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
        <Input id={campo("telefone")} name="telefone" type="tel" defaultValue={valores.telefone ?? ""} />
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
    </div>
  );
}
