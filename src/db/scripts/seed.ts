import { betterAuth } from "better-auth";
import { and, eq } from "drizzle-orm";
import { opcoesAuth } from "../../auth/config";
import type { Role } from "../../domain/rbac";
import { criarTenantComAdmin } from "../../server/onboarding";
import { listarMembershipsDoUsuario } from "../../server/memberships";
import { createDb } from "../client";
import { criarAcordo } from "../../server/financeiro";
import { criarPaciente } from "../../server/pacientes";
import { criarSala, criarUnidade, definirHorarios } from "../../server/unidades";
import { acordosFinanceiros, memberships, pacientes, profissionais, unidades, users } from "../schema";
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
    // Contas de dev já nascem confirmadas (o login exige e-mail verificado).
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
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

      const ctxAdmin = { tenantId: membership.tenantId, userId: adminId, role: "admin" } as const;
      await withTenant(
        ctxAdmin,
        async (tx) => {
          for (const role of ["recepcao", "profissional"] as const) {
            await tx
              .insert(memberships)
              .values({ userId: ids.get(role)!, role })
              .onConflictDoNothing();
          }
          // Cadastro de profissional já vinculado ao usuário (no app real isso vem do convite).
          const [membershipProfissional] = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.userId, ids.get("profissional")!), eq(memberships.role, "profissional")));
          await tx
            .insert(profissionais)
            .values({
              nome: `Dra. Profissional ${espaco.prefixo}`,
              email: `profissional@${espaco.prefixo}.salus.dev`,
              conselho: "CRP",
              registro: "06/123456",
              especialidade: "Psicologia",
              membershipId: membershipProfissional.id,
            })
            .onConflictDoNothing();
          await tx
            .insert(profissionais)
            .values({ nome: `Dr. Convidado ${espaco.prefixo}`, email: `convidado@${espaco.prefixo}.salus.dev`, conselho: "CRM" })
            .onConflictDoNothing();
        },
        db,
      );

      // Unidade com horário comercial e três salas.
      const existentes = await withTenant(ctxAdmin, (tx) => tx.select({ id: unidades.id }).from(unidades), db);
      if (existentes.length === 0) {
        const { id: unidadeId } = await criarUnidade(ctxAdmin, { nome: "Unidade Centro", endereco: "Av. Paulista, 1000 — São Paulo" }, db);
        await definirHorarios(
          ctxAdmin,
          unidadeId,
          [
            ...[1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: "07:00", fecha: "21:00" })),
            { diaSemana: 6, abre: "08:00", fecha: "13:00" },
          ],
          db,
        );
        await criarSala(ctxAdmin, unidadeId, { nome: "Sala 1", recursos: ["Maca", "Pia"] }, db);
        await criarSala(ctxAdmin, unidadeId, { nome: "Sala 2", recursos: ["Divã"] }, db);
        await criarSala(ctxAdmin, unidadeId, { nome: "Sala 3", recursos: ["Mesa de reunião"] }, db);
      }

      // Acordos de exemplo: locação por hora e por consulta (caixa centralizado, falta cobrada).
      const temAcordos = await withTenant(ctxAdmin, (tx) => tx.select({ id: acordosFinanceiros.id }).from(acordosFinanceiros).limit(1), db);
      if (temAcordos.length === 0) {
        const lista = await withTenant(ctxAdmin, (tx) => tx.select({ id: profissionais.id, email: profissionais.email }).from(profissionais), db);
        const desde = `${new Date().toISOString().slice(0, 7)}-01`;
        for (const p of lista) {
          await criarAcordo(
            ctxAdmin,
            p.email.startsWith("profissional@")
              ? { profissionalId: p.id, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: desde }
              : { profissionalId: p.id, modelo: "consulta", valorConsultaCentavos: 3000, fluxoRecebimento: "centralizado", regraFalta: "integral", vigenteDe: desde },
            db,
          );
        }
      }

      // Pacientes de demonstração (dados fictícios).
      const temPacientes = await withTenant(ctxAdmin, (tx) => tx.select({ id: pacientes.id }).from(pacientes).limit(1), db);
      if (temPacientes.length === 0) {
        for (const paciente of [
          { nome: "Ana Paciente", telefone: "11 90000-0001", consentimentoLembretes: true },
          { nome: "Bruno Paciente", telefone: "11 90000-0002" },
          { nome: "Carla Paciente", telefone: "11 90000-0003", consentimentoLembretes: true },
        ]) {
          await criarPaciente(ctxAdmin, paciente, new Date(), db);
        }
      }
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
