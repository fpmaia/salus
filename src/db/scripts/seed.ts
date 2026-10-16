import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { opcoesAuth } from "../../auth/config";
import type { Role } from "../../domain/rbac";
import { criarTenantComAdmin } from "../../server/onboarding";
import { listarMembershipsDoUsuario } from "../../server/memberships";
import { createDb } from "../client";
import { memberships, users } from "../schema";
import { withTenant } from "../tenant";

// Seed de DESENVOLVIMENTO: dois espaços com admin, recepção e profissional cada.
// Roda com o papel da aplicação (sujeito à RLS), pelo mesmo caminho do onboarding.
// Idempotente: usuários/espaços já existentes são reaproveitados.

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

const SENHA_DEV = "salus-dev-123";

const ESPACOS = [
  {
    nome: "Coworking Alfa",
    documento: "11.222.333/0001-81",
    prefixo: "alfa",
  },
  {
    nome: "Espaço Beta Saúde",
    documento: "529.982.247-25",
    prefixo: "beta",
  },
];

const PESSOAS: { role: Role; nome: string }[] = [
  { role: "admin", nome: "Admin" },
  { role: "recepcao", nome: "Recepção" },
  { role: "profissional", nome: "Dra. Profissional" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const db = createDb(url);
  const auth = betterAuth(opcoesAuth(db));

  async function garantirUsuario(nome: string, email: string): Promise<string> {
    const [existente] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existente) return existente.id;
    const { user } = await auth.api.signUpEmail({ body: { name: nome, email, password: SENHA_DEV } });
    return user.id;
  }

  try {
    for (const espaco of ESPACOS) {
      const ids = new Map<Role, string>();
      for (const pessoa of PESSOAS) {
        const email = `${pessoa.role}@${espaco.prefixo}.salus.dev`;
        ids.set(pessoa.role, await garantirUsuario(`${pessoa.nome} ${espaco.prefixo}`, email));
      }

      const adminId = ids.get("admin")!;
      let [membership] = await listarMembershipsDoUsuario(adminId, db);
      if (!membership) {
        await criarTenantComAdmin(adminId, { nomeTenant: espaco.nome, documento: espaco.documento }, db);
        [membership] = await listarMembershipsDoUsuario(adminId, db);
      }

      await withTenant(
        { tenantId: membership.tenantId, userId: adminId, role: "admin" },
        async (tx) => {
          for (const role of ["recepcao", "profissional"] as const) {
            await tx
              .insert(memberships)
              .values({ userId: ids.get(role)!, role })
              .onConflictDoNothing();
          }
        },
        db,
      );
      console.log(`✔ ${espaco.nome}: ${PESSOAS.map((p) => `${p.role}@${espaco.prefixo}.salus.dev`).join(", ")}`);
    }
    console.log(`Senha de todos os usuários de dev: ${SENHA_DEV}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
