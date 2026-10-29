import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { users } from "../../src/db/schema";
import { withUser } from "../../src/db/tenant";
import { PAPEIS_PLATAFORMA, papelPode, PERMISSOES_PLATAFORMA, type PermissaoPlataforma } from "../../src/domain/permissoes-plataforma";
import {
  aceitarConviteEquipePlataforma,
  conviteEquipePendenteDoUsuario,
  convidarParaEquipePlataforma,
  definirPapelPlataforma,
  listarConvitesEquipePlataforma,
  listarEquipePlataforma,
  removerDaEquipePlataforma,
} from "../../src/server/equipe-plataforma";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import {
  alterarPlanoClinicaPlataforma,
  listarAuditoriaPlataforma,
  papelNaPlataforma,
  reativarClinicaPlataforma,
  suspenderClinicaPlataforma,
} from "../../src/server/plataforma";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";

// Equipe da plataforma: papéis Dono/Financeiro/Suporte, convite por e-mail verificado, e a
// mesma matriz de permissões no servidor (TS) e no banco (app_plataforma_pode).

let db: Database;
let dono: string;
let tenantId: string;

async function emailDe(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u.email;
}

async function membroComPapel(nome: string, papel: string) {
  const id = await criarUsuario(db, nome);
  await db.update(users).set({ role: "superadmin" }).where(eq(users.id, id));
  await definirPapelPlataforma(dono, id, papel, db);
  return id;
}

beforeAll(async () => {
  db = criarDbApp();
  dono = await criarUsuario(db, "Dono Equipe");
  await db.update(users).set({ role: "superadmin" }).where(eq(users.id, dono));
  const admin = await criarUsuario(db, "Admin Clinica Equipe");
  ({ tenantId } = await criarTenantComAdmin(admin, { nomeTenant: "Clínica da Equipe", documento: "11.222.333/0001-81" }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("equipe da plataforma", () => {
  it("superadmin sem papel registrado é Dono (compatível com o superadmin único)", async () => {
    expect(await papelNaPlataforma(dono, db)).toBe("dono");
  });

  it("convite vale só para o e-mail verificado; ao aceitar, entra com o papel", async () => {
    const pessoa = await criarUsuario(db, "Pessoa Financeiro");
    const email = await emailDe(pessoa);
    await convidarParaEquipePlataforma(dono, { email: email.toUpperCase(), papel: "financeiro" }, new Date(), db);
    expect((await listarConvitesEquipePlataforma(dono, db)).find((c) => c.email === email)).toMatchObject({ papel: "financeiro" });

    // E-mail ainda não verificado: não vê o convite nem consegue aceitar.
    expect(await conviteEquipePendenteDoUsuario(pessoa, db)).toBeNull();
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, pessoa));
    const convite = await conviteEquipePendenteDoUsuario(pessoa, db);
    expect(convite).toMatchObject({ papel: "financeiro", convidadoPor: "Dono Equipe" });

    const intruso = await criarUsuario(db, "Intruso Equipe");
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, intruso));
    await expect(aceitarConviteEquipePlataforma(intruso, convite!.id, db)).rejects.toThrow("Convite inválido");

    expect(await aceitarConviteEquipePlataforma(pessoa, convite!.id, db)).toBe("financeiro");
    expect(await papelNaPlataforma(pessoa, db)).toBe("financeiro");
    expect((await listarEquipePlataforma(pessoa, db)).find((m) => m.userId === pessoa)).toMatchObject({ papel: "financeiro" });
    await expect(aceitarConviteEquipePlataforma(pessoa, convite!.id, db)).rejects.toThrow("Convite inválido");
    await expect(convidarParaEquipePlataforma(dono, { email: await emailDe(pessoa), papel: "suporte" }, new Date(), db)).rejects.toThrow("já está na equipe");
  });

  it("só o Dono convida; quem não está na equipe não convida", async () => {
    const suporte = await membroComPapel("Suporte Convida", "suporte");
    await expect(convidarParaEquipePlataforma(suporte, { email: "x@teste.dev", papel: "dono" }, new Date(), db)).rejects.toThrow("não permite");
    const comum = await criarUsuario(db, "Comum Equipe");
    await expect(convidarParaEquipePlataforma(comum, { email: "x@teste.dev", papel: "dono" }, new Date(), db)).rejects.toThrow("Acesso negado");
  });

  it("financeiro troca plano mas não suspende; suporte suspende mas não troca plano (servidor e banco)", async () => {
    const financeiro = await membroComPapel("Financeiro Papel", "financeiro");
    const suporte = await membroComPapel("Suporte Papel", "suporte");

    await expect(suspenderClinicaPlataforma(financeiro, tenantId, "teste", db)).rejects.toThrow("não permite");
    expect(codigoPg(await capturarErro(withUser(financeiro, (tx) => tx.execute(sql`select app_plataforma_suspender_clinica(${tenantId}, 'x')`), db)))).toBe(SEM_PRIVILEGIO);
    await suspenderClinicaPlataforma(suporte, tenantId, "teste de papel", db);
    await reativarClinicaPlataforma(suporte, tenantId, db);

    const [{ id: planoBasico }] = (await db.execute<{ id: string }>(sql`select id from planos_saas where codigo = 'basico'`)).rows;
    await expect(alterarPlanoClinicaPlataforma(suporte, tenantId, planoBasico, db)).rejects.toThrow("não permite");
    expect(codigoPg(await capturarErro(withUser(suporte, (tx) => tx.execute(sql`select app_plataforma_alterar_plano(${tenantId}, ${planoBasico})`), db)))).toBe(SEM_PRIVILEGIO);
    await alterarPlanoClinicaPlataforma(financeiro, tenantId, planoBasico, db);
  });

  it("a matriz do banco é a mesma do código", async () => {
    const ids = {
      dono,
      financeiro: await membroComPapel("Matriz Financeiro", "financeiro"),
      suporte: await membroComPapel("Matriz Suporte", "suporte"),
    };
    const comum = await criarUsuario(db, "Matriz Comum");
    for (const papel of PAPEIS_PLATAFORMA) {
      for (const perm of Object.keys(PERMISSOES_PLATAFORMA) as PermissaoPlataforma[]) {
        const { rows } = await withUser(ids[papel], (tx) => tx.execute<{ pode: boolean }>(sql`select app_plataforma_pode(${perm}) as pode`), db);
        expect({ papel, perm, pode: rows[0].pode }).toEqual({ papel, perm, pode: papelPode(papel, perm) });
      }
    }
    const { rows } = await withUser(comum, (tx) => tx.execute<{ pode: boolean }>(sql`select app_plataforma_pode('ver') as pode`), db);
    expect(rows[0].pode).toBe(false);
  });

  it("a equipe nunca fica sem Dono; remover tira o acesso", async () => {
    const outrosDonos = (await listarEquipePlataforma(dono, db)).filter((m) => m.papel === "dono" && m.userId !== dono && !m.banido);
    for (const m of outrosDonos) await definirPapelPlataforma(dono, m.userId, "suporte", db);
    try {
      await expect(definirPapelPlataforma(dono, dono, "suporte", db)).rejects.toThrow("ao menos um Dono");
      await expect(removerDaEquipePlataforma(dono, dono, db)).rejects.toThrow("ao menos um Dono");
    } finally {
      for (const m of outrosDonos) await definirPapelPlataforma(dono, m.userId, "dono", db);
    }

    const saindo = await membroComPapel("Sai Da Equipe", "suporte");
    await removerDaEquipePlataforma(dono, saindo, db);
    expect(await papelNaPlataforma(saindo, db)).toBeNull();
    const eventos = await listarAuditoriaPlataforma(dono, 50, db, { acao: "plataforma.equipe.remover", alvoId: saindo });
    expect(eventos).toHaveLength(1);
  });
});
