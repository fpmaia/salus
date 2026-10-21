import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { opcoesAuth } from "../../auth/config";
import { getDb } from "../client";
import { users } from "../schema";

// Promove (ou cria) o superadmin da plataforma.
// Uso: npm run plataforma:promover -- dono@exemplo.com   (ou PLATFORM_OWNER_EMAILS no .env)
// Conta criada aqui recebe uma senha aleatória, exibida uma única vez.

try {
  process.loadEnvFile();
} catch {
  // sem .env
}

async function main() {
  const emailAlvo = (process.argv[2] || process.env.PLATFORM_OWNER_EMAILS?.split(",")[0] || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailAlvo)) {
    throw new Error("Informe o e-mail do superadmin: npm run plataforma:promover -- dono@exemplo.com (ou PLATFORM_OWNER_EMAILS)");
  }
  const db = getDb();

  try {
    let [usuario] = await db.select().from(users).where(eq(users.email, emailAlvo));
    if (!usuario) {
      const senha = randomBytes(18).toString("base64url");
      const auth = betterAuth(opcoesAuth(db));
      const criado = await auth.api.signUpEmail({ body: { email: emailAlvo, password: senha, name: "Superadmin" } });
      if (!criado?.user) throw new Error("Falha ao criar usuário pelo Better Auth");
      [usuario] = await db.select().from(users).where(eq(users.email, emailAlvo));
      console.log(`Conta criada. Senha inicial (exibida só agora, troque no primeiro acesso): ${senha}`);
    }

    // Conta criada por script, pelo dono da plataforma: dispensa o link de confirmação.
    await db.update(users).set({ role: "superadmin", banned: false, emailVerified: true }).where(eq(users.id, usuario.id));
    console.log(`${usuario.email} agora é superadmin. Acesso: /plataforma`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error("Erro ao promover superadmin:", err instanceof Error ? err.message : err);
  process.exit(1);
});
