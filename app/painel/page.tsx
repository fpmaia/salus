import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { obterContextoTenant } from "@/src/auth/sessao";
import { auditLog, memberships, users } from "@/src/db/schema";
import { withTenant } from "@/src/db/tenant";
import { pode, ROTULOS_ROLE } from "@/src/domain/rbac";
import { formatarDataBr, minhasProximasReservas } from "@/src/server/reservas";

export default async function PainelPage() {
  const ctx = await obterContextoTenant();
  const podeVerAuditoria = pode(ctx.role, "auditoria.ver");
  const ehProfissional = pode(ctx.role, "reservas.proprias");

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
  const proximas = ehProfissional ? await minhasProximasReservas(ctx) : [];

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2">
      {ehProfissional && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Minhas próximas reservas</CardTitle>
            <CardDescription>
              Reserve salas pela <Link href="/painel/agenda" className="text-primary underline-offset-4 hover:underline">agenda</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma reserva futura.</p>
            ) : (
              <ul className="divide-y">
                {proximas.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {formatarDataBr(r.data)} · {r.horaInicio}–{r.horaFim}
                      {r.recorrente && <span className="ml-2 text-xs text-muted-foreground">semanal</span>}
                    </span>
                    <span className="text-muted-foreground">
                      {r.salaNome} · {r.unidadeNome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

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
  );
}
