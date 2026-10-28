import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { users } from "../../src/db/schema";
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

import { criarTenantComAdmin } from "../../src/server/onboarding";
import { obterStatusLicencaProntuarioProfissional } from "../../src/server/assinatura";
import { criarProfissional } from "../../src/server/profissionais";
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

  it("convite de profissional pela Equipe cria o cadastro e libera a compra do prontuário", async () => {
    const userId = await criarUsuario(db, "Paula Convidada");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const { token } = await convidarMembro(ctxClinica, { email: u.email, role: "profissional" }, new Date(), db);
    await aceitarConviteMembro(userId, token, db);

    const ctxProf: ContextoTenant = { tenantId: ctxClinica.tenantId, userId, role: "profissional" };
    const status = await obterStatusLicencaProntuarioProfissional(ctxProf, new Date(), db);
    expect(status.possuiPerfilProfissional).toBe(true);
    if (!status.possuiPerfilProfissional) return;
    expect(status.estado).toBe("inativa");
    expect(status.profissionalNome).toBe("Paula Convidada");
  });

  it("convite pela Equipe vincula o profissional já cadastrado com o mesmo e-mail", async () => {
    const userId = await criarUsuario(db, "Otávio Cadastrado");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const { id: profissionalId } = await criarProfissional(ctxClinica, { nome: "Dr. Otávio", email: u.email.toUpperCase() }, db);
    const { token } = await convidarMembro(ctxClinica, { email: u.email, role: "profissional" }, new Date(), db);
    await aceitarConviteMembro(userId, token, db);

    const ctxProf: ContextoTenant = { tenantId: ctxClinica.tenantId, userId, role: "profissional" };
    const status = await obterStatusLicencaProntuarioProfissional(ctxProf, new Date(), db);
    expect(status.possuiPerfilProfissional && status.profissionalId).toBe(profissionalId);
  });

  it("trocar o papel para profissional cria o cadastro", async () => {
    const userId = await criarUsuario(db, "Rui Recepção");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const { token } = await convidarMembro(ctxClinica, { email: u.email, role: "recepcao" }, new Date(), db);
    await aceitarConviteMembro(userId, token, db);
    const membro = (await listarMembrosDaClinica(ctxClinica, db)).find((m) => m.userId === userId)!;

    await alterarPapelMembro(ctxClinica, membro.membershipId, "profissional", db);
    const ctxProf: ContextoTenant = { tenantId: ctxClinica.tenantId, userId, role: "profissional" };
    const status = await obterStatusLicencaProntuarioProfissional(ctxProf, new Date(), db);
    expect(status.possuiPerfilProfissional).toBe(true);
  });
});
