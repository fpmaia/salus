import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { listarContratos } from "@/src/server/contratos";
import { COR_SITUACAO, ROTULO_SITUACAO } from "./situacao";
import { formatarDataBr } from "@/src/server/reservas";

export default async function ContratosPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "contratos.ver");
  const contratos = await listarContratos(ctx);
  const gerencia = pode(ctx.role, "contratos.gerenciar");
  const proprio = ctx.role === "profissional";
  // "Meu contrato": o profissional vai direto ao contrato vigente (o histórico está nele).
  const vigente = proprio ? contratos.find((c) => c.situacao === "vigente") : undefined;
  if (vigente) redirect(`/painel/contratos/${vigente.id}`);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{proprio ? "Meu contrato" : "Contratos"}</h1>
          <p className="text-sm text-muted-foreground">
            {proprio
              ? "O que você paga pelo uso das salas, as regras de cancelamento e a sua grade fixa."
              : "Um contrato por profissional: valores, regras de falta e de cancelamento e grade fixa. Reajuste cria uma nova versão; os meses anteriores não mudam."}
          </p>
        </div>
        {gerencia && (
          <Button asChild>
            <Link href="/painel/contratos/novo">Novo contrato</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{contratos.length} contrato(s)</CardTitle>
          <CardDescription>Versões antigas ficam no histórico de cada profissional.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {contratos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum contrato ainda.{" "}
              {gerencia && (
                <Link href="/painel/contratos/novo" className="text-primary underline-offset-4 hover:underline">
                  Crie o primeiro
                </Link>
              )}
            </p>
          ) : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">Contrato</th>
                  {!proprio && <th className="py-2 pr-2 font-medium">Profissional</th>}
                  <th className="py-2 pr-2 font-medium">Condição principal</th>
                  <th className="py-2 pr-2 font-medium">Vigência</th>
                  <th className="py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 pr-2">
                      <Link href={`/painel/contratos/${c.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                        {c.codigo}
                      </Link>
                    </td>
                    {!proprio && <td className="py-2 pr-2">{c.profissionalNome}</td>}
                    <td className="py-2 pr-2 text-muted-foreground">
                      {c.resumo}
                      {c.salaNome && <span className="block text-xs">Sala: {c.salaNome}</span>}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {formatarDataBr(c.vigenteDe)} {c.vigenteAte ? `→ ${formatarDataBr(c.vigenteAte)}` : "→ sem término"}
                    </td>
                    <td className="py-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[c.situacao]}`}>{ROTULO_SITUACAO[c.situacao]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
