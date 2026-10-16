import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { auditLog, memberships, users } from "@/src/db/schema";
import { withTenant } from "@/src/db/tenant";
import { pode, ROTULOS_ROLE } from "@/src/domain/rbac";
import { BotaoSair } from "./botao-sair";

export default async function PainelPage() {
  const ctx = await obterContextoTenant();
  const podeVerAuditoria = pode(ctx.role, "auditoria.ver");

  // Sem filtro por tenant_id de propósito: a RLS restringe ao tenant do contexto.
  const { membros, eventos } = await withTenant(ctx, async (tx) => ({
    membros: await tx
      .select({ id: memberships.id, role: memberships.role, nome: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(memberships.criadoEm),
    eventos: podeVerAuditoria
      ? await tx.select().from(auditLog).orderBy(desc(auditLog.criadoEm)).limit(10)
      : [],
  }));

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
            S
          </span>
          <div>
            <p className="font-medium leading-tight">{ctx.tenantNome}</p>
            <p className="text-xs text-muted-foreground">
              {ctx.usuario.nome} · {ROTULOS_ROLE[ctx.role]}
            </p>
          </div>
        </div>
        <BotaoSair />
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>Usuários com acesso a este espaço.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {membros.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {m.nome}
                    <span className="block text-xs text-muted-foreground">{m.email}</span>
                  </span>
                  <span className="text-muted-foreground">{ROTULOS_ROLE[m.role]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {podeVerAuditoria && (
          <Card>
            <CardHeader>
              <CardTitle>Auditoria</CardTitle>
              <CardDescription>Últimos eventos registrados.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {eventos.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-xs">{e.acao}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
