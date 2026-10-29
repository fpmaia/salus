import { ShieldCheck, ShieldAlert, UserCog } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DESCRICOES_PAPEL_PLATAFORMA,
  PAPEIS_PLATAFORMA,
  PERMISSOES_PLATAFORMA,
  ROTULOS_PAPEL_PLATAFORMA,
  type PermissaoPlataforma,
} from "@/src/domain/permissoes-plataforma";
import { listarConvitesEquipePlataforma, listarEquipePlataforma, VALIDADE_CONVITE_EQUIPE_DIAS } from "@/src/server/equipe-plataforma";
import { acessoPlataforma } from "../acesso";
import { convidarEquipeAcao, definirPapelEquipeAcao, removerDaEquipeAcao, revogarConviteEquipeAcao } from "./actions";

const ROTULOS_PERMISSAO: Record<PermissaoPlataforma, string> = {
  ver: "Ver clínicas, faturas, usuários e auditoria",
  "clinicas.gerenciar": "Suspender e reativar clínicas, notas e sessões",
  "convites.gerenciar": "Convites de teste grátis",
  "financeiro.gerenciar": "Plano da clínica, descontos, faturas, acordos e cupons",
  "usuarios.banir": "Banir usuários",
  "planos.editar": "Preços e limites dos planos",
  "equipe.gerenciar": "Equipe da plataforma",
};

function data(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function EquipePlataformaPage() {
  const { usuario, pode } = await acessoPlataforma();
  const gerencia = pode("equipe.gerenciar");
  const [equipe, convites] = await Promise.all([
    listarEquipePlataforma(usuario.id),
    gerencia ? listarConvitesEquipePlataforma(usuario.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <UserCog className="size-6 text-primary" /> Equipe da plataforma
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem administra o Salus e o que cada papel pode fazer. Toda ação fica na auditoria; a verificação em duas etapas é obrigatória.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pessoas ({equipe.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {equipe.map((m) => (
              <li key={m.userId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.nome}</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{ROTULOS_PAPEL_PLATAFORMA[m.papel]}</span>
                    {m.doisFatores ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success">
                        <ShieldCheck className="size-3" /> 2FA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                        <ShieldAlert className="size-3" /> sem 2FA
                      </span>
                    )}
                    {m.banido && <span className="text-[11px] font-semibold text-destructive">banido</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.email} · desde {data(m.desde)}
                  </span>
                </div>
                {gerencia && (
                  <div className="flex flex-wrap items-end gap-2">
                    <FormAcao
                      acao={definirPapelEquipeAcao.bind(null, m.userId)}
                      textoBotao="Mudar papel"
                      textoPendente="…"
                      variante="outline"
                      className="flex items-end gap-2"
                    >
                      <NativeSelect name="papel" aria-label={`Papel de ${m.nome}`} defaultValue={m.papel}>
                        {PAPEIS_PLATAFORMA.map((p) => (
                          <option key={p} value={p}>
                            {ROTULOS_PAPEL_PLATAFORMA[p]}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormAcao>
                    <FormAcao
                      acao={removerDaEquipeAcao.bind(null, m.userId)}
                      textoBotao={m.userId === usuario.id ? "Sair da equipe" : "Remover"}
                      textoPendente="…"
                      variante="outline"
                      confirmar={`Tirar ${m.nome} da equipe da plataforma? A conta continua existindo, sem acesso a /plataforma.`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {gerencia && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convidar para a equipe</CardTitle>
            <CardDescription>
              A pessoa entra (ou cria a conta) com o e-mail convidado e aceita em /plataforma. O convite vale {VALIDADE_CONVITE_EQUIPE_DIAS} dias.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormAcao acao={convidarEquipeAcao} textoBotao="Enviar convite" textoPendente="Enviando…" className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="eq-email">E-mail</Label>
                  <Input id="eq-email" name="email" type="email" required placeholder="pessoa@lscode.com.br" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="eq-papel">Papel</Label>
                  <NativeSelect id="eq-papel" name="papel" defaultValue="suporte">
                    {PAPEIS_PLATAFORMA.map((p) => (
                      <option key={p} value={p}>
                        {ROTULOS_PAPEL_PLATAFORMA[p]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </FormAcao>
            {convites.length > 0 && (
              <ul className="divide-y border-t text-sm">
                {convites.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{c.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {ROTULOS_PAPEL_PLATAFORMA[c.papel]} · aguardando aceite até {data(c.expiraEm)}
                        {c.criadoPorNome ? ` · convidado por ${c.criadoPorNome}` : ""}
                      </span>
                    </span>
                    <FormAcao acao={revogarConviteEquipeAcao.bind(null, c.id)} textoBotao="Revogar" textoPendente="…" variante="outline" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que cada papel pode fazer</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Permissão</th>
                {PAPEIS_PLATAFORMA.map((p) => (
                  <th key={p} className="px-3 py-2 text-center font-medium" title={DESCRICOES_PAPEL_PLATAFORMA[p]}>
                    {ROTULOS_PAPEL_PLATAFORMA[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSOES_PLATAFORMA) as PermissaoPlataforma[]).map((perm) => (
                <tr key={perm} className="border-b last:border-0">
                  <td className="py-2 pr-3">{ROTULOS_PERMISSAO[perm]}</td>
                  {PAPEIS_PLATAFORMA.map((p) => (
                    <td key={p} className="px-3 py-2 text-center">
                      {(PERMISSOES_PLATAFORMA[perm] as readonly string[]).includes(p) ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}
