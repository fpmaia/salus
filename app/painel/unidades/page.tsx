import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pode } from "@/src/domain/rbac";
import { obterConfiguracoes } from "@/src/server/configuracoes";
import { listarUnidades } from "@/src/server/unidades";
import { MODULOS, modulosDoEspaco, ROTULOS_MODULO } from "@/src/server/modulos";
import { criarUnidadeAcao, definirModulosAcao, definirPoliticaCancelamentoAcao } from "./actions";
import { CamposUnidade } from "./campos-unidade";

export default async function UnidadesPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "salas.gerenciar");
  const [unidades, configuracoes] = await Promise.all([listarUnidades(ctx), obterConfiguracoes(ctx)]);
  const modulos = pode(ctx.role, "tenant.configurar") ? await modulosDoEspaco(ctx) : null;

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

      {pode(ctx.role, "tenant.configurar") && (
        <Card>
          <CardHeader>
            <CardTitle>Política de cancelamento</CardTitle>
            <CardDescription>
              Cancelamentos de pacientes com menos antecedência que isso ficam marcados como tardios (a cobrança entra
              com o financeiro).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao acao={definirPoliticaCancelamentoAcao} textoBotao="Salvar política">
              <div className="flex max-w-xs flex-col gap-2">
                <Label htmlFor="horas">Antecedência mínima (horas)</Label>
                <Input
                  id="horas"
                  name="horas"
                  type="number"
                  min={0}
                  max={168}
                  defaultValue={configuracoes.antecedenciaCancelamentoHoras}
                  required
                />
              </div>
            </FormAcao>
          </CardContent>
        </Card>
      )}

      {modulos && (
        <Card>
          <CardHeader>
            <CardTitle>Módulos do espaço</CardTitle>
            <CardDescription>Ligue só o que o espaço usa: desligado, o módulo some do menu de todos.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao acao={definirModulosAcao} textoBotao="Salvar módulos">
              {MODULOS.map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={m} defaultChecked={modulos[m]} className="mt-1" />
                  <span>
                    {ROTULOS_MODULO[m].nome}
                    <span className="block text-xs text-muted-foreground">{ROTULOS_MODULO[m].descricao}</span>
                  </span>
                </label>
              ))}
            </FormAcao>
          </CardContent>
        </Card>
      )}

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
