import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { ErroPermissao } from "../../src/domain/rbac";
import { pagamentoOnlineAtivo, pagarMeuSaldoComPix, salvarConfigCobranca, type FabricaGateway } from "../../src/server/cobrancas";
import { criarContrato } from "../../src/server/contratos";
import { lancarAjuste, minhaRegraDePreco } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Autoatendimento do profissional: preço do contrato antes de reservar e PIX do saldo devedor.

const AGORA = new Date("2030-04-02T12:00:00Z");

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let gateway: GatewayFalso;
const fabrica: FabricaGateway = () => gateway;
const opcoes = () => ({ agora: AGORA, fabrica, database: db });

/** Profissional com login (e CPF, se informado). */
async function profissionalComLogin(nome: string, documento?: string): Promise<{ id: string; ctx: ContextoTenant }> {
  const { id } = await criarProfissional(admin, { nome, email: `${randomUUID()}@teste.dev`, documento }, db);
  const userId = await criarUsuario(db, nome);
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, id));
    },
    db,
  );
  return { id, ctx: { tenantId: admin.tenantId, userId, role: "profissional" } };
}

let ana: { id: string; ctx: ContextoTenant };

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  db = criarDbApp();
  gateway = new GatewayFalso("auto_");
  const adminId = await criarUsuario(db, "Admin Autoatendimento");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Autoatendimento", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  const recepcaoId = await criarUsuario(db, "Recepcao Autoatendimento");
  await withTenant(admin, (tx) => tx.insert(memberships).values({ userId: recepcaoId, role: "recepcao" }), db);
  recepcao = { tenantId, userId: recepcaoId, role: "recepcao" };
  ana = await profissionalComLogin("Dra. Ana", "529.982.247-25");
});

afterAll(async () => {
  await db?.$client.end();
});

describe("preço antes de reservar", () => {
  it("sem contrato vigente, não há regra", async () => {
    expect(await minhaRegraDePreco(ana.ctx, AGORA, db)).toBeNull();
  });

  it("com contrato, devolve a regra e o código; só para o próprio profissional", async () => {
    const { codigo } = await criarContrato(admin, { profissionalId: ana.id, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: "2030-03-01" }, { agora: AGORA }, db);
    const r = await minhaRegraDePreco(ana.ctx, AGORA, db);
    expect(r).toMatchObject({ contrato: { codigo }, regra: { modelo: "hora", valorHoraCentavos: 4500, minutosUsadosNoMes: 0 } });
    expect(await capturarErro(minhaRegraDePreco(recepcao, AGORA, db))).toBeInstanceOf(ErroPermissao);
  });
});

describe("PIX do saldo devedor", () => {
  it("recusa enquanto o espaço não ativou o pagamento online", async () => {
    await lancarAjuste(admin, { profissionalId: ana.id, data: "2030-04-01", natureza: "debito", valorCentavos: 9000, descricao: "Locação de março" }, db);
    expect(await pagamentoOnlineAtivo(ana.ctx, db)).toBe(false);
    await expect(pagarMeuSaldoComPix(ana.ctx, opcoes())).rejects.toThrow("ainda não ativou");
  });

  it("gera o PIX do saldo com o copia e cola; clicar de novo não duplica", async () => {
    await salvarConfigCobranca(admin, { ativo: true, ambiente: "sandbox", diasVencimento: 5, multaBp: 200, jurosMesBp: 100, apiKey: "$aact_hmlg_teste" }, db);
    expect(await pagamentoOnlineAtivo(ana.ctx, db)).toBe(true);

    const { cobranca, nova } = await pagarMeuSaldoComPix(ana.ctx, opcoes());
    expect(nova).toBe(true);
    expect(cobranca).toMatchObject({ profissionalId: ana.id, valorCentavos: 9000, forma: "PIX", status: "pendente", vencimento: "2030-04-07" });
    expect(cobranca.pixCopiaECola).toBe(`00020126PIX-FALSO-${cobranca.asaasPaymentId}`);

    const deNovo = await pagarMeuSaldoComPix(ana.ctx, opcoes());
    expect(deNovo).toMatchObject({ nova: false, cobranca: { id: cobranca.id } });
    expect(gateway.cobrancas.size).toBe(1);
  });

  it("sem CPF ou sem dívida, explica o motivo", async () => {
    const semCpf = await profissionalComLogin("Dr. Beto");
    await lancarAjuste(admin, { profissionalId: semCpf.id, data: "2030-04-01", natureza: "debito", valorCentavos: 1000, descricao: "Locação" }, db);
    await expect(pagarMeuSaldoComPix(semCpf.ctx, opcoes())).rejects.toThrow("CPF ou CNPJ");
    const emDia = await profissionalComLogin("Dra. Carla", "111.444.777-35");
    await expect(pagarMeuSaldoComPix(emDia.ctx, opcoes())).rejects.toThrow("não tem valores a pagar");
  });

  it("é só do profissional", async () => {
    expect(await capturarErro(pagarMeuSaldoComPix(recepcao, opcoes()))).toBeInstanceOf(ErroPermissao);
  });
});
