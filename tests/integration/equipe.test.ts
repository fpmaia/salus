import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { memberships, users } from "../../src/db/schema";
import type { ContextoTenant } from "../../src/db/tenant";
import {
  aceitarConviteMembro,
  alterarPapelMembro,
  convidarMembro,
  desativarMembro,
  listarConvitesPendentes,
  listarMembrosDaClinica,
  obterConviteMembroPublico,
  reativarMembro,
  revogarConvite,
} from "../../src/server/equipe";
import { ErroNegocio } from "../../src/server/erros";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarDbApp, criarUsuario } from "./helpers";

let db: Database;
let ctxClinica: ContextoTenant;
let adminUserId: string;

beforeAll(async () => {
  db = criarDbApp();
  adminUserId = await criarUsuario(db, "Dono Clinica Equipe");
  const { tenantId } = await criarTenantComAdmin(
    adminUserId,
    { nomeTenant: "Clínica Teste Equipe", documento: "12345678000195" },
    db,
  );
  ctxClinica = { tenantId, userId: adminUserId, role: "admin" };
});

afterAll(async () => {
  await db?.$client.end();
});

describe("gestão de equipe e controle de usuários (por clínica)", () => {
  it("lista membros ativos da clínica com o admin criador", async () => {
    const membros = await listarMembrosDaClinica(ctxClinica, db);
    expect(membros.length).toBeGreaterThanOrEqual(1);
    const criador = membros.find((m) => m.userId === adminUserId);
    expect(criador).toBeDefined();
    expect(criador?.role).toBe("admin");
    expect(criador?.ativo).toBe(true);
  });

  it("cria convite para recepção e impede rebaixar único admin", async () => {
    // Tenta rebaixar o único admin -> deve falhar
    const membros = await listarMembrosDaClinica(ctxClinica, db);
    const adminMembro = membros.find((m) => m.userId === adminUserId)!;

    await expect(
      alterarPapelMembro(ctxClinica, adminMembro.membershipId, "recepcao", db),
    ).rejects.toThrow("A clínica precisa ter pelo menos um administrador ativo.");

    // Tenta desativar o único admin -> deve falhar
    await expect(
      desativarMembro(ctxClinica, adminMembro.membershipId, db),
    ).rejects.toThrow("Não é possível desativar o único administrador da clínica.");
  });

  it("convida novo membro para recepção, revoga e cria novo", async () => {
    const emailRecepcao = "recepcionista.teste@salus.dev";
    const { token, id: conviteId } = await convidarMembro(
      ctxClinica,
      { email: emailRecepcao, role: "recepcao" },
      new Date(),
      db,
    );
    expect(token).toBeDefined();

    let pendentes = await listarConvitesPendentes(ctxClinica, new Date(), db);
    expect(pendentes.some((c) => c.id === conviteId)).toBe(true);

    // Revoga o convite
    await revogarConvite(ctxClinica, conviteId, db);

    pendentes = await listarConvitesPendentes(ctxClinica, new Date(), db);
    expect(pendentes.some((c) => c.id === conviteId)).toBe(false);
  });

  it("aceita convite de equipe com criação de membership e papel correto", async () => {
    // 1. Cria usuário destino
    const novoUserId = await criarUsuario(db, "Maria Recepcionista");
    const [novoUser] = await db.select().from(users).where(eq(users.id, novoUserId));

    // 2. Cria convite
    const { token } = await convidarMembro(
      ctxClinica,
      { email: novoUser.email, role: "recepcao" },
      new Date(),
      db,
    );

    // 3. Lê dados públicos do convite
    const infoPublica = await obterConviteMembroPublico(token, db);
    expect(infoPublica).not.toBeNull();
    expect(infoPublica?.valido).toBe(true);
    expect(infoPublica?.tenantNome).toBe("Clínica Teste Equipe");
    expect(infoPublica?.role).toBe("recepcao");

    // 4. Aceita o convite com o novo usuário
    const res = await aceitarConviteMembro(novoUserId, token, db);
    expect(res.tenantId).toBe(ctxClinica.tenantId);

    // 5. Verifica que o novo membro está ativo na clínica com papel 'recepcao'
    const membrosAtualizados = await listarMembrosDaClinica(ctxClinica, db);
    const novoMembro = membrosAtualizados.find((m) => m.userId === novoUserId);
    expect(novoMembro).toBeDefined();
    expect(novoMembro?.role).toBe("recepcao");
    expect(novoMembro?.ativo).toBe(true);

    // 6. Altera o papel para profissional
    await alterarPapelMembro(ctxClinica, novoMembro!.membershipId, "profissional", db);
    let membrosAposMudanca = await listarMembrosDaClinica(ctxClinica, db);
    expect(membrosAposMudanca.find((m) => m.userId === novoUserId)?.role).toBe("profissional");

    // 7. Desativa o membro
    await desativarMembro(ctxClinica, novoMembro!.membershipId, db);
    membrosAposMudanca = await listarMembrosDaClinica(ctxClinica, db);
    expect(membrosAposMudanca.find((m) => m.userId === novoUserId)?.ativo).toBe(false);

    // 8. Reativa o membro
    await reativarMembro(ctxClinica, novoMembro!.membershipId, db);
    membrosAposMudanca = await listarMembrosDaClinica(ctxClinica, db);
    expect(membrosAposMudanca.find((m) => m.userId === novoUserId)?.ativo).toBe(true);
  });
});
