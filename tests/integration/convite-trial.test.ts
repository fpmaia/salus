import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { faturasSaas, planosSaas, tenants, users } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { primeiraCompetenciaCobrada } from "../../src/domain/cobranca";
import { gerarFaturaDoMes, obterAssinatura, periodoDeTesteDoEspaco } from "../../src/server/assinatura";
import {
  criarConviteClinica,
  definirFimDoTeste,
  listarConvitesClinica,
  obterConviteClinicaPublico,
  revogarConviteClinica,
} from "../../src/server/convites-clinica";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Convite trial da plataforma: o espaço nasce no plano do convite, sem fatura até o fim do
// teste (e no mês em que ele termina), e o convite só serve uma vez, ao e-mail convidado.

let db: Database;
let superadmin: string;
let planoPro: string;
const gateway = new GatewayFalso("trial_");

async function emailDe(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u.email;
}

beforeAll(async () => {
  db = criarDbApp();
  superadmin = await criarUsuario(db, "Superadmin Convites");
  await db.update(users).set({ role: "superadmin" }).where(eq(users.id, superadmin));
  [{ id: planoPro }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "pro"));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("convite trial para clínica", () => {
  let tenantId: string;
  let dono: string;
  let token: string;

  it("só o superadmin cria; o app não lê a tabela de convites direto", async () => {
    const comum = await criarUsuario(db, "Curioso");
    await expect(criarConviteClinica(comum, { email: "x@teste.dev", planoId: planoPro, diasTeste: 30 }, new Date(), db)).rejects.toThrow("Acesso negado");
    expect(codigoPg(await capturarErro(db.execute(sql`select * from convites_clinica`)))).toBe(SEM_PRIVILEGIO);
  });

  it("o link mostra plano e dias; outro e-mail não usa o convite", async () => {
    dono = await criarUsuario(db, "Dona Clinica Trial");
    ({ token } = await criarConviteClinica(superadmin, { email: (await emailDe(dono)).toUpperCase(), planoId: planoPro, diasTeste: 30, observacao: "Indicação" }, new Date(), db));
    expect(await obterConviteClinicaPublico(token, db)).toMatchObject({ planoNome: "Pro", diasTeste: 30, situacao: "pendente", email: await emailDe(dono) });

    const intruso = await criarUsuario(db, "Intruso");
    await expect(
      criarTenantComAdmin(intruso, { nomeTenant: "Não é dele", documento: "529.982.247-25", conviteTrial: token }, db),
    ).rejects.toThrow("mesmo e-mail");
  });

  it("o espaço nasce no plano do convite, em teste, e o convite fica usado", async () => {
    ({ tenantId } = await criarTenantComAdmin(dono, { nomeTenant: "Clínica em Teste", documento: "11.222.333/0001-81", conviteTrial: token }, db));
    const ctx = { tenantId, userId: dono, role: "admin" as const };
    const assinatura = await obterAssinatura(ctx, db);
    expect(assinatura.plano?.codigo).toBe("pro");
    expect(assinatura.teste).toMatchObject({ ativo: true });
    expect((await obterConviteClinicaPublico(token, db))?.situacao).toBe("usado");
    const lista = await listarConvitesClinica(superadmin, db);
    expect(lista.find((c) => c.tenantId === tenantId)).toMatchObject({ situacao: "usado", tenantNome: "Clínica em Teste", observacao: "Indicação" });

    const outro = await criarUsuario(db, "Segunda Tentativa");
    await expect(criarTenantComAdmin(outro, { nomeTenant: "De novo", documento: "529.982.247-25", conviteTrial: token }, db)).rejects.toThrow("já foi usado");
  });

  it("teste de 30 dias termina no 30º dia contando hoje", async () => {
    const ctx = { tenantId, userId: dono, role: "admin" as const };
    const teste = await periodoDeTesteDoEspaco(ctx, new Date(), db);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const esperado = new Date(Date.parse(`${hoje}T12:00:00Z`) + 29 * 86_400_000).toISOString().slice(0, 10);
    expect(teste?.ate).toBe(esperado);
  });

  it("sem fatura durante o teste nem no mês em que ele termina; cobra a partir do mês seguinte", async () => {
    const ctx = { tenantId, userId: dono, role: "admin" as const };
    const teste = (await periodoDeTesteDoEspaco(ctx, new Date(), db))!;
    const fimDoTeste = new Date(`${teste.ate}T15:00:00Z`);
    expect(await gerarFaturaDoMes(tenantId, { agora: new Date(), gateway, database: db })).toMatchObject({ criada: false });
    expect(await gerarFaturaDoMes(tenantId, { agora: fimDoTeste, gateway, database: db })).toMatchObject({ criada: false });

    const primeira = primeiraCompetenciaCobrada(teste.ate);
    expect((await gerarFaturaDoMes(tenantId, { agora: new Date(`${primeira.slice(0, 8)}02T15:00:00Z`), gateway, database: db })).criada).toBe(true);
    const faturas = await withTenant(ctx, (tx) => tx.select().from(faturasSaas), db);
    expect(faturas.map((f) => f.competencia)).toEqual([primeira]);
    expect(faturas[0].valorCentavos).toBe(49900);
  });

  it("superadmin encerra o teste: a cobrança volta já no mês corrente", async () => {
    const outroDono = await criarUsuario(db, "Dono Encerrado");
    const { token: t2 } = await criarConviteClinica(superadmin, { email: await emailDe(outroDono), planoId: planoPro, diasTeste: 60 }, new Date(), db);
    const { tenantId: t } = await criarTenantComAdmin(outroDono, { nomeTenant: "Teste encerrado", documento: "529.982.247-25", conviteTrial: t2 }, db);
    expect((await gerarFaturaDoMes(t, { gateway, database: db })).criada).toBe(false);

    await expect(definirFimDoTeste(outroDono, t, null, db)).rejects.toThrow("Acesso negado");
    await definirFimDoTeste(superadmin, t, null, db);
    const [tenant] = await withTenant({ tenantId: t, userId: outroDono, role: "admin" }, (tx) => tx.select().from(tenants), db);
    expect(tenant.testeAte).toBeNull();
    expect((await gerarFaturaDoMes(t, { gateway, database: db })).criada).toBe(true);
  });

  it("convite revogado ou vencido não serve", async () => {
    const pessoa = await criarUsuario(db, "Pessoa Revogada");
    const revogado = await criarConviteClinica(superadmin, { email: await emailDe(pessoa), planoId: planoPro, diasTeste: 15 }, new Date(), db);
    await revogarConviteClinica(superadmin, revogado.id, db);
    expect((await obterConviteClinicaPublico(revogado.token, db))?.situacao).toBe("revogado");
    await expect(criarTenantComAdmin(pessoa, { nomeTenant: "Revogada", documento: "529.982.247-25", conviteTrial: revogado.token }, db)).rejects.toThrow("inválido ou revogado");
    await expect(revogarConviteClinica(superadmin, revogado.id, db)).rejects.toThrow("já foi usado ou revogado");

    const vencido = await criarConviteClinica(superadmin, { email: await emailDe(pessoa), planoId: planoPro, diasTeste: 15, validadeDias: 1 }, new Date(Date.now() - 2 * 86_400_000), db);
    expect((await obterConviteClinicaPublico(vencido.token, db))?.situacao).toBe("expirado");
    await expect(criarTenantComAdmin(pessoa, { nomeTenant: "Vencida", documento: "529.982.247-25", conviteTrial: vencido.token }, db)).rejects.toThrow("expirou");
  });

  it("novo convite para o mesmo e-mail substitui o pendente", async () => {
    const pessoa = await criarUsuario(db, "Pessoa Reconvidada");
    const primeiro = await criarConviteClinica(superadmin, { email: await emailDe(pessoa), planoId: planoPro, diasTeste: 15 }, new Date(), db);
    await criarConviteClinica(superadmin, { email: await emailDe(pessoa), planoId: planoPro, diasTeste: 45 }, new Date(), db);
    expect((await obterConviteClinicaPublico(primeiro.token, db))?.situacao).toBe("revogado");
  });
});
