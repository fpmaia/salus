import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { listarUnidades } from "@/src/server/unidades";
import { criarUnidadeAcao } from "./actions";
import { CamposUnidade } from "./campos-unidade";

export default async function UnidadesPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "salas.gerenciar");
  const unidades = await listarUnidades(ctx);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Unidades</CardTitle>
          <CardDescription>Endereços físicos do espaço. Cada unidade tem suas salas e horários.</CardDescription>
        </CardHeader>
        <CardContent>
          {unidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada ainda.</p>
          ) : (
            <ul className="divide-y">
              {unidades.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <Link href={`/painel/unidades/${u.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {u.nome}
                    </Link>
                    {!u.ativo && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}
                    {u.endereco && <span className="block text-xs text-muted-foreground">{u.endereco}</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {u.salasAtivas} {u.salasAtivas === 1 ? "sala ativa" : "salas ativas"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova unidade</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAcao acao={criarUnidadeAcao} textoBotao="Criar unidade">
            <CamposUnidade />
          </FormAcao>
        </CardContent>
      </Card>
    </main>
  );
}
