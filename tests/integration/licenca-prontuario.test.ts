import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { faturasSaasItens, licencasProntuario, memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import {
  ativarLicencaProntuario,
  confirmarPagamentoProntuario,
  gerarCobrancaProntuarioProfissional,
  gerarFaturaDoMes,
  obterStatusLicencaProntuarioProfissional,
  processarWebhookPlataforma,
  trocarPlano,
} from "../../src/server/assinatura";
import { ErroNegocio } from "../../src/server/erros";
import { definirModulos } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { obterProntuario, salvarRascunho } from "../../src/server/prontuario";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Licença individual do prontuário: teste de 15 dias, quem paga depois (espaço x profissional),
// cobrança própria do profissional e bloqueio de escrita sem licença válida.

const DIA = 24 * 60 * 60 * 1000;
const T0 = new Date("2030-04-02T12:00:00Z");
const DEPOIS_DO_TESTE = new Date(T0.getTime() + 16 * DIA);

let db: Database;
let admin: ContextoTenant;
let gateway: GatewayFalso;
const ctx: Record<"ana" | "beto" | "caio", ContextoTenant> = {} as never;
const prof: Record<"ana" | "beto" | "caio", string> = { ana: "", beto: "", caio: "" };
const paciente: Record<"ana" | "beto" | "caio", string> = { ana: "", beto: "", caio: "" };

/** Profissional com usuário próprio (e-mail diferente do cadastro, como acontece na vida real). */
async function vincular(nome: "ana" | "beto" | "caio") {
  const userId = await criarUsuario(db, `Prof Licenca ${nome}`);
  ({ id: prof[nome] } = await criarProfissional(
    admin,
    { nome: `Dra. ${nome}`, email: `cadastro.${nome}.${randomUUID()}@teste.dev`, documento: "529.982.247-25" },
    db,
  ));
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, prof[nome]));
    },
    db,
  );
  ctx[nome] = { tenantId: admin.tenantId, userId, role: "profissional" };
  ({ id: paciente[nome] } = await criarPaciente(ctx[nome], { nome: `Paciente de ${nome}` }, T0, db));
}

const escrever = (nome: "ana" | "beto" | "caio", agora: Date) =>
  salvarRascunho(ctx[nome], { pacienteId: paciente[nome], anotacoes: "Evolução" }, { agora, database: db });

const licenca = async (nome: "ana" | "beto" | "caio") =>
  (await withTenant(admin, (tx) => tx.select().from(licencasProntuario).where(eq(licencasProntuario.profissionalId, prof[nome])), db))[0];

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.ASAAS_WEBHOOK_TOKEN = "token-licenca";
  db = criarDbApp();
  gateway = new GatewayFalso("lic");
  const adminId = await criarUsuario(db, "Admin Licenca");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Espaço Licença", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  await definirModulos(admin, { fiscal: false, agendaOnline: false, prontuario: true }, db);
  for (const nome of ["ana", "beto", "caio"] as const) await vincular(nome);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("sem licença", () => {
  it("o profissional não escreve no prontuário", async () => {
    const erro = await capturarErro(escrever("ana", T0));
    expect(erro).toBeInstanceOf(ErroNegocio);
    expect((erro as Error).message).toMatch(/Ative o prontuário/);
  });

  it("o status acha o profissional pelo vínculo do usuário, mesmo com e-mail diferente", async () => {
    const s = await obterStatusLicencaProntuarioProfissional(ctx.ana, T0, db);
    expect(s).toMatchObject({ possuiPerfilProfissional: true, profissionalId: prof.ana, estado: "inativa", podeEscrever: false, jaTeveTeste: false });
  });

  it("'Já paguei' sem cobrança não ativa nada (antes ativava de graça)", async () => {
    const r = await confirmarPagamentoProntuario(ctx.ana, undefined, { agora: T0, gateway, database: db });
    expect(r.confirmado).toBe(false);
    expect((await obterStatusLicencaProntuarioProfissional(ctx.ana, T0, db)).podeEscrever).toBe(false);
  });

  it("um profissional não mexe na licença de outro", async () => {
    expect(((await capturarErro(ativarLicencaProntuario(ctx.ana, prof.beto, T0, db))) as Error).message).toMatch(/seu próprio perfil/);
  });
});

describe("ativada pelo próprio profissional", () => {
  it("dá 15 dias de teste e libera a escrita", async () => {
    await ativarLicencaProntuario(ctx.ana, prof.ana, T0, db);
    expect(await licenca("ana")).toMatchObject({ ativo: true, responsavel: "profissional", statusPagamento: "trial" });
    await expect(escrever("ana", T0)).resolves.toHaveProperty("id");
  });

  it("acabado o teste, fica só leitura até pagar", async () => {
    const erro = await capturarErro(escrever("ana", DEPOIS_DO_TESTE));
    expect((erro as Error).message).toMatch(/pagamento do seu prontuário venceu/);
    await expect(obterProntuario(ctx.ana, paciente.ana, { agora: DEPOIS_DO_TESTE, database: db })).resolves.toBeTruthy();
    expect((await obterStatusLicencaProntuarioProfissional(ctx.ana, DEPOIS_DO_TESTE, db)).estado).toBe("aguardando_pagamento");
  });

  it("reativar não dá um segundo teste", async () => {
    await ativarLicencaProntuario(ctx.ana, prof.ana, DEPOIS_DO_TESTE, db);
    expect((await obterStatusLicencaProntuarioProfissional(ctx.ana, DEPOIS_DO_TESTE, db)).estado).toBe("aguardando_pagamento");
  });

  it("'Já paguei' com a licença de teste mas sem cobrança não ativa (antes marcava como paga)", async () => {
    const r = await confirmarPagamentoProntuario(ctx.ana, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db });
    expect(r.confirmado).toBe(false);
    expect((await licenca("ana")).statusPagamento).toBe("trial");
  });

  it("cobrança no preço do plano; repetir reaproveita a cobrança em aberto", async () => {
    const a = await gerarCobrancaProntuarioProfissional(ctx.ana, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db });
    const b = await gerarCobrancaProntuarioProfissional(ctx.ana, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db });
    expect(a.valorCentavos).toBe(4990);
    expect(b.asaasPaymentId).toBe(a.asaasPaymentId);
    expect(gateway.cobrancas.get(a.asaasPaymentId)!.externalReference).toMatch(new RegExp(`^prontuario_prof:${admin.tenantId}:${prof.ana}:\\d+$`));
    expect((await licenca("ana")).asaasCustomerId).toBeTruthy();
  });

  it("'Já paguei' antes do pagamento não ativa; depois do pagamento libera 30 dias", async () => {
    const { asaasPaymentId } = await licenca("ana");
    expect((await confirmarPagamentoProntuario(ctx.ana, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db })).confirmado).toBe(false);
    gateway.definirStatus(asaasPaymentId!, "RECEIVED");
    expect((await confirmarPagamentoProntuario(ctx.ana, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db })).confirmado).toBe(true);
    const l = await licenca("ana");
    expect(l.statusPagamento).toBe("pago");
    expect(l.pagoAte!.getTime()).toBe(DEPOIS_DO_TESTE.getTime() + 30 * DIA);
    await expect(escrever("ana", new Date(DEPOIS_DO_TESTE.getTime() + 29 * DIA))).resolves.toHaveProperty("id");
    expect((await capturarErro(escrever("ana", new Date(DEPOIS_DO_TESTE.getTime() + 31 * DIA)))) as Error).toBeInstanceOf(ErroNegocio);
  });

  it("webhook: confirma a cobrança atual uma vez, ignora repetição e cobrança de outro", async () => {
    const agora = new Date(DEPOIS_DO_TESTE.getTime() + 31 * DIA);
    const { asaasPaymentId } = await gerarCobrancaProntuarioProfissional(ctx.ana, undefined, { agora, gateway, database: db });
    const referencia = gateway.cobrancas.get(asaasPaymentId)!.externalReference;
    gateway.definirStatus(asaasPaymentId, "CONFIRMED", "CREDIT_CARD");
    const evento = { id: `evt_${randomUUID()}`, event: "PAYMENT_CONFIRMED", payment: { id: asaasPaymentId, externalReference: referencia } };
    const opcoes = { agora, gateway, database: db };

    expect(await processarWebhookPlataforma("token-licenca", { ...evento, payment: { ...evento.payment, id: "pay_de_outro" } }, opcoes)).toBe("ignorado");
    expect(await processarWebhookPlataforma("token-licenca", evento, opcoes)).toBe("ok");
    expect(await processarWebhookPlataforma("token-licenca", evento, opcoes)).toBe("duplicado");
    const l = await licenca("ana");
    expect(l.statusPagamento).toBe("pago");
    expect(l.pagoAte!.getTime()).toBe(agora.getTime() + 30 * DIA);
  });

  it("a licença do profissional nunca entra na fatura do espaço", async () => {
    await gerarFaturaDoMes(admin.tenantId, { agora: new Date("2030-06-02T12:00:00Z"), gateway, database: db });
    const itens = await withTenant(admin, (tx) => tx.select().from(faturasSaasItens).where(eq(faturasSaasItens.tipo, "prontuario_licenca")), db);
    expect(itens).toEqual([]);
  });
});

describe("ativada pelo admin (paga pelo espaço)", () => {
  it("segue ativa depois do teste e o profissional não gera cobrança própria", async () => {
    await ativarLicencaProntuario(admin, prof.beto, T0, db);
    expect(await licenca("beto")).toMatchObject({ responsavel: "espaco", ativo: true });
    await expect(escrever("beto", DEPOIS_DO_TESTE)).resolves.toHaveProperty("id");
    const erro = await capturarErro(gerarCobrancaProntuarioProfissional(ctx.beto, undefined, { agora: DEPOIS_DO_TESTE, gateway, database: db }));
    expect((erro as Error).message).toMatch(/paga pelo espaço/);
  });

  it("assumir pelo espaço uma licença vencida do profissional reativa a escrita", async () => {
    await ativarLicencaProntuario(ctx.caio, prof.caio, T0, db);
    await expect(escrever("caio", DEPOIS_DO_TESTE)).rejects.toThrow(/venceu/);
    await ativarLicencaProntuario(admin, prof.caio, DEPOIS_DO_TESTE, db);
    expect((await licenca("caio")).responsavel).toBe("espaco");
    await expect(escrever("caio", DEPOIS_DO_TESTE)).resolves.toHaveProperty("id");
  });

  it("entra na fatura mensal pelo preço do plano (Enterprise: R$ 39,90)", async () => {
    await trocarPlano(admin, "enterprise", db);
    await gerarFaturaDoMes(admin.tenantId, { agora: new Date("2030-07-02T12:00:00Z"), gateway, database: db });
    const itens = await withTenant(admin, (tx) => tx.select().from(faturasSaasItens).where(eq(faturasSaasItens.tipo, "prontuario_licenca")), db);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ quantidade: 2, valorUnitarioCentavos: 3990, valorTotalCentavos: 7980 });
  });
});
