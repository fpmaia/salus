import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { auditLog, memberships, tenantSettings, tenants } from "../../src/db/schema";
import { type ContextoTenant, withTenant, withUser } from "../../src/db/tenant";
import { listarMembershipsDoUsuario } from "../../src/server/memberships";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";

// Critério de pronto da Fase 0: um usuário do tenant A não lê nem grava dados do
// tenant B, mesmo com query sem filtro. Tudo roda com o papel da aplicação (salus_app).

let db: Database;
let ctxA: ContextoTenant;
let ctxB: ContextoTenant;
let profissionalB: string;

beforeAll(async () => {
  db = criarDbApp();

  const adminA = await criarUsuario(db, "Admin A");
  const adminB = await criarUsuario(db, "Admin B");
  const { tenantId: tenantA } = await criarTenantComAdmin(
    adminA,
    { nomeTenant: "Tenant A", documento: "11.222.333/0001-81" },
    db,
  );
  const { tenantId: tenantB } = await criarTenantComAdmin(
    adminB,
    { nomeTenant: "Tenant B", documento: "529.982.247-25" },
    db,
  );
  ctxA = { tenantId: tenantA, userId: adminA, role: "admin" };
  ctxB = { tenantId: tenantB, userId: adminB, role: "admin" };

  profissionalB = await criarUsuario(db, "Profissional B");
  await withTenant(ctxB, (tx) => tx.insert(memberships).values({ userId: profissionalB, role: "profissional" }), db);
});

afterAll(async () => {
  await db?.$client.end();
});

/** Snapshot do tenant B lido no contexto de B, para provar que nada mudou. */
function snapshotB() {
  return withTenant(
    ctxB,
    async (tx) => ({
      tenant: await tx.select().from(tenants),
      settings: await tx.select().from(tenantSettings),
      membros: await tx.select().from(memberships).orderBy(memberships.id),
      auditoria: await tx.select().from(auditLog).orderBy(auditLog.id),
    }),
    db,
  );
}

describe("leitura", () => {
  it("SELECT sem filtro devolve apenas linhas do tenant do contexto", async () => {
    const lido = await withTenant(
      ctxA,
      async (tx) => ({
        tenants: await tx.select().from(tenants),
        settings: await tx.select().from(tenantSettings),
        membros: await tx.select().from(memberships),
        auditoria: await tx.select().from(auditLog),
      }),
      db,
    );

    expect(lido.tenants.map((t) => t.id)).toEqual([ctxA.tenantId]);
    expect(lido.settings).toHaveLength(1);
    expect(lido.membros.length).toBeGreaterThan(0);
    expect(lido.auditoria.length).toBeGreaterThan(0);
    for (const linha of [...lido.settings, ...lido.membros, ...lido.auditoria]) {
      expect(linha.tenantId).toBe(ctxA.tenantId);
    }
  });

  it("filtrar explicitamente pelo tenant B não devolve nada", async () => {
    const lido = await withTenant(
      ctxA,
      async (tx) => ({
        tenant: await tx.select().from(tenants).where(eq(tenants.id, ctxB.tenantId)),
        membros: await tx.select().from(memberships).where(eq(memberships.tenantId, ctxB.tenantId)),
        membroB: await tx.select().from(memberships).where(eq(memberships.userId, profissionalB)),
        auditoria: await tx.select().from(auditLog).where(eq(auditLog.tenantId, ctxB.tenantId)),
      }),
      db,
    );
    expect(lido).toEqual({ tenant: [], membros: [], membroB: [], auditoria: [] });
  });

  it("SQL cru sem WHERE também é filtrado", async () => {
    const { rows } = await withTenant(
      ctxA,
      (tx) => tx.execute<{ tenant_id: string }>(sql`select distinct tenant_id from memberships`),
      db,
    );
    expect(rows).toEqual([{ tenant_id: ctxA.tenantId }]);
  });

  it("sem withTenant nenhuma linha de tenant é visível", async () => {
    expect(await db.select().from(tenants)).toEqual([]);
    expect(await db.select().from(memberships)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("o contexto não vaza para a próxima query na mesma conexão", async () => {
    await withTenant(ctxA, (tx) => tx.select().from(memberships), db);
    // Pool com max: 1 → mesma conexão física.
    const { rows } = await db.execute<{ tenant: string | null }>(
      sql`select nullif(current_setting('app.tenant_id', true), '') as tenant`,
    );
    expect(rows[0].tenant).toBeNull();
    expect(await db.select().from(memberships)).toEqual([]);
  });
});

describe("escrita", () => {
  it("INSERT com tenant_id de B é rejeitado pela RLS", async () => {
    const antes = await snapshotB();
    const usuario = await criarUsuario(db, "Intruso");

    const erros = [
      await capturarErro(
        withTenant(ctxA, (tx) => tx.insert(memberships).values({ tenantId: ctxB.tenantId, userId: usuario, role: "admin" }), db),
      ),
      await capturarErro(
        withTenant(ctxA, (tx) => tx.insert(auditLog).values({ tenantId: ctxB.tenantId, acao: "x", entidade: "y" }), db),
      ),
      await capturarErro(
        withTenant(ctxA, (tx) => tx.insert(tenantSettings).values({ tenantId: ctxB.tenantId }), db),
      ),
    ];
    for (const erro of erros) expect(codigoPg(erro)).toBe(SEM_PRIVILEGIO);
    expect(await snapshotB()).toEqual(antes);
  });

  it("UPDATE e DELETE sem filtro não alcançam linhas de B", async () => {
    const antes = await snapshotB();

    const afetados = await withTenant(
      ctxA,
      async (tx) => ({
        tenants: await tx.update(tenants).set({ nome: "Renomeado por A" }).returning({ id: tenants.id }),
        settings: await tx.update(tenantSettings).set({ timezone: "America/Manaus" }).returning({ tenantId: tenantSettings.tenantId }),
        membros: await tx.update(memberships).set({ ativo: true }).returning({ tenantId: memberships.tenantId }),
        removidos: await tx.delete(memberships).where(eq(memberships.userId, profissionalB)).returning(),
      }),
      db,
    );

    expect(afetados.tenants).toEqual([{ id: ctxA.tenantId }]);
    expect(afetados.settings).toEqual([{ tenantId: ctxA.tenantId }]);
    expect(new Set(afetados.membros.map((m) => m.tenantId))).toEqual(new Set([ctxA.tenantId]));
    expect(afetados.removidos).toEqual([]);
    expect(await snapshotB()).toEqual(antes);
  });

  it("não é possível mover uma linha de A para B", async () => {
    const erro = await capturarErro(
      withTenant(ctxA, (tx) => tx.update(memberships).set({ tenantId: ctxB.tenantId }), db),
    );
    expect(codigoPg(erro)).toBe(SEM_PRIVILEGIO);
  });

  it("INSERT sem contexto falha", async () => {
    const usuario = await criarUsuario(db, "Sem contexto");
    const erro = await capturarErro(db.insert(memberships).values({ userId: usuario, role: "admin" }));
    expect(codigoPg(erro)).toBeDefined();
  });

  it("audit_log é append-only para a aplicação", async () => {
    const update = await capturarErro(withTenant(ctxA, (tx) => tx.update(auditLog).set({ acao: "alterado" }), db));
    const remocao = await capturarErro(withTenant(ctxA, (tx) => tx.delete(auditLog), db));
    expect(codigoPg(update)).toBe(SEM_PRIVILEGIO);
    expect(codigoPg(remocao)).toBe(SEM_PRIVILEGIO);
  });
});

describe("garantias estruturais", () => {
  it("o papel da aplicação não é superusuário, não tem BYPASSRLS e não é dono das tabelas", async () => {
    const { rows: papel } = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(papel).toEqual([{ rolsuper: false, rolbypassrls: false }]);

    const { rows: proprias } = await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(proprias).toEqual([]);
  });

  it("toda tabela com tenant_id tem RLS ENABLE + FORCE e policy", async () => {
    const { rows } = await db.execute<{
      tabela: string;
      rls: boolean;
      forcada: boolean;
      policies: number;
    }>(sql`
      select c.relname as tabela,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as forcada,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and (c.relname = 'tenants'
             or exists (select 1 from information_schema.columns col
                        where col.table_schema = 'public'
                          and col.table_name = c.relname
                          and col.column_name = 'tenant_id'))
      order by 1
    `);

    expect(rows.map((r) => r.tabela)).toEqual(
      expect.arrayContaining(["audit_log", "memberships", "tenant_settings", "tenants"]),
    );
    for (const linha of rows) {
      expect(linha, linha.tabela).toMatchObject({ rls: true, forcada: true });
      expect(linha.policies, linha.tabela).toBeGreaterThan(0);
    }
  });

  it("app_memberships_do_usuario só devolve as memberships do próprio usuário", async () => {
    const deA = await listarMembershipsDoUsuario(ctxA.userId, db);
    expect(deA.map((m) => m.tenantId)).toEqual([ctxA.tenantId]);

    const deB = await listarMembershipsDoUsuario(profissionalB, db);
    expect(deB.map((m) => [m.tenantId, m.role])).toEqual([[ctxB.tenantId, "profissional"]]);

    // Com contexto só de usuário, as tabelas de tenant continuam invisíveis.
    const direto = await withUser(ctxA.userId, (tx) => tx.select().from(memberships), db);
    expect(direto).toEqual([]);
  });

  it("withTenant rejeita contexto inválido antes de tocar no banco", async () => {
    await expect(
      withTenant({ ...ctxA, tenantId: "' or 1=1 --" }, (tx) => tx.select().from(tenants), db),
    ).rejects.toThrow();
    await expect(
      withTenant({ ...ctxA, role: "superadmin" as never }, (tx) => tx.select().from(tenants), db),
    ).rejects.toThrow();
  });
});
