import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { creditosTenant, descontosTenant, faturasSaas, faturasSaasItens, planosSaas, users } from "../../src/db/schema";
import { withTenant, withUser } from "../../src/db/tenant";
import { primeiraCompetenciaCobrada } from "../../src/domain/cobranca";
import { gerarFaturaDoMes, situacaoDaAssinaturaDoEspaco } from "../../src/server/assinatura";
import { criarConviteClinica } from "../../src/server/convites-clinica";
import { definirPapelPlataforma } from "../../src/server/equipe-plataforma";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { alterarPlanoClinicaPlataforma, listarAuditoriaPlataforma } from "../../src/server/plataforma";
import {
  aplicarCupomNoEspaco,
  criarDescontoClinica,
  lancarCreditoClinica,
  listarCupons,
  obterCobrancaDaClinica,
  revogarDescontoClinica,
  salvarCondicoesComerciais,
  salvarCupom,
} from "../../src/server/plataforma-financeiro";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";
import { GatewayFalso } from "./gateway-falso";

// Gestão financeira da plataforma: preço negociado, dia de vencimento e carência por clínica,
// descontos, créditos e cupons, sempre pelo papel certo e refletidos na fatura gerada.

let db: Database;
let dono: string;
let financeiro: string;
let suporte: string;
let planoPro: string;
let planoBasico: string;
const gateway = new GatewayFalso("fin_");

const SEM_CONDICOES = {
  precoMensalCentavos: null,
  precoSalaExtraCentavos: null,
  precoProfissionalExtraCentavos: null,
  precoUnidadeExtraCentavos: null,
  precoProntuarioCentavos: null,
  diaVencimento: null,
  diasCarencia: null,
};

async function emailDe(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u.email;
}

async function novaClinica(nome: string, documento = "11.222.333/0001-81") {
  const admin = await criarUsuario(db, `Admin ${nome}`);
  const { tenantId } = await criarTenantComAdmin(admin, { nomeTenant: nome, documento }, db);
  await alterarPlanoClinicaPlataforma(dono, tenantId, planoPro, db);
  return { tenantId, admin, ctx: { tenantId, userId: admin, role: "admin" as const } };
}

async function faturasDe(ctx: { tenantId: string; userId: string; role: "admin" }) {
  return withTenant(ctx, async (tx) => ({ faturas: await tx.select().from(faturasSaas), itens: await tx.select().from(faturasSaasItens) }), db);
}

beforeAll(async () => {
  db = criarDbApp();
  dono = await criarUsuario(db, "Dono Financeiro Plataforma");
  financeiro = await criarUsuario(db, "Pessoa do Financeiro");
  suporte = await criarUsuario(db, "Pessoa do Suporte");
  for (const id of [dono, financeiro, suporte]) await db.update(users).set({ role: "superadmin" }).where(eq(users.id, id));
  await definirPapelPlataforma(dono, financeiro, "financeiro", db);
  await definirPapelPlataforma(dono, suporte, "suporte", db);
  [{ id: planoPro }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "pro"));
  [{ id: planoBasico }] = await db.select({ id: planosSaas.id }).from(planosSaas).where(eq(planosSaas.codigo, "basico"));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("condições comerciais, descontos e créditos", () => {
  it("suporte não mexe em valores (servidor e banco); o espaço não grava direto", async () => {
    const { tenantId, ctx } = await novaClinica("Clínica Papel Financeiro");
    await expect(criarDescontoClinica(suporte, tenantId, { tipo: "percentual", valor: 10, inicio: "2027-01-01", fim: null, motivo: "teste" }, db)).rejects.toThrow(
      "não permite",
    );
    expect(
      codigoPg(await capturarErro(withUser(suporte, (tx) => tx.execute(sql`select app_plataforma_lancar_credito(${tenantId}, 100, 'x')`), db))),
    ).toBe(SEM_PRIVILEGIO);
    expect(codigoPg(await capturarErro(withTenant(ctx, (tx) => tx.insert(descontosTenant).values({ tipo: "percentual", valor: 100, competenciaInicio: "2027-01-01", motivo: "eu mesmo" }), db)))).toBe(
      SEM_PRIVILEGIO,
    );
  });

  it("preço negociado, dia de vencimento, desconto por período e crédito entram na fatura", async () => {
    const { tenantId, ctx } = await novaClinica("Clínica Negociada");
    await salvarCondicoesComerciais(financeiro, tenantId, { ...SEM_CONDICOES, precoMensalCentavos: 39900, diaVencimento: 25, observacao: "contrato anual" }, db);
    await criarDescontoClinica(financeiro, tenantId, { tipo: "percentual", valor: 20, inicio: "2027-01-15", fim: "2027-02-01", motivo: "parceria" }, db);
    const creditoId = await lancarCreditoClinica(financeiro, tenantId, { valorCentavos: 5000, motivo: "instabilidade" }, db);

    const previa = await obterCobrancaDaClinica(suporte, tenantId, new Date("2027-01-02T15:00:00Z"), db);
    expect(previa.proxima).toMatchObject({ competencia: "2027-01-01", vencimento: "2027-01-25", valorTotalCentavos: 26920 });

    await gerarFaturaDoMes(tenantId, { agora: new Date("2027-01-02T15:00:00Z"), gateway, database: db });
    await gerarFaturaDoMes(tenantId, { agora: new Date("2027-02-02T15:00:00Z"), gateway, database: db });
    await gerarFaturaDoMes(tenantId, { agora: new Date("2027-03-02T15:00:00Z"), gateway, database: db });

    const { faturas, itens } = await faturasDe(ctx);
    const porCompetencia = Object.fromEntries(faturas.map((f) => [f.competencia, f]));
    expect(porCompetencia["2027-01-01"]).toMatchObject({ valorCentavos: 26920, vencimento: "2027-01-25" });
    expect(porCompetencia["2027-02-01"].valorCentavos).toBe(31920);
    expect(porCompetencia["2027-03-01"].valorCentavos).toBe(39900);
    const itensJaneiro = itens.filter((i) => i.faturaId === porCompetencia["2027-01-01"].id);
    expect(itensJaneiro.map((i) => [i.tipo, i.valorTotalCentavos])).toEqual([
      ["base", 39900],
      ["desconto", -7980],
      ["credito", -5000],
    ]);
    expect(itensJaneiro[0].descricao).toContain("condição negociada");
    expect(itensJaneiro.find((i) => i.tipo === "credito")?.referenciaId).toBe(creditoId);
    const [credito] = await withTenant(ctx, (tx) => tx.select().from(creditosTenant), db);
    expect(credito.saldoCentavos).toBe(0);
    expect(gateway.cobrancas.get(porCompetencia["2027-01-01"].asaasPaymentId!)?.valor).toBe(26920);

    const auditoria = await listarAuditoriaPlataforma(dono, 20, db, { alvoId: tenantId });
    expect(auditoria.map((e) => e.acao)).toEqual(expect.arrayContaining(["plataforma.condicoes.salvar", "plataforma.desconto.criar", "plataforma.credito.lancar"]));
  });

  it("fatura zerada por desconto nasce paga (isenta), sem ir ao Asaas", async () => {
    const { tenantId, ctx } = await novaClinica("Clínica Isenta");
    const descontoId = await criarDescontoClinica(financeiro, tenantId, { tipo: "percentual", valor: 100, inicio: "2027-01-01", fim: null, motivo: "cortesia" }, db);
    const antes = gateway.cobrancas.size;
    expect(await gerarFaturaDoMes(tenantId, { agora: new Date("2027-01-02T15:00:00Z"), gateway, database: db })).toMatchObject({ criada: true, isenta: true });
    expect(gateway.cobrancas.size).toBe(antes);
    const { faturas } = await faturasDe(ctx);
    expect(faturas[0]).toMatchObject({ valorCentavos: 0, status: "paga", formaBaixa: "isenta" });

    await revogarDescontoClinica(financeiro, descontoId, db);
    expect((await gerarFaturaDoMes(tenantId, { agora: new Date("2027-02-02T15:00:00Z"), gateway, database: db })).criada).toBe(true);
    expect((await faturasDe(ctx)).faturas.find((f) => f.competencia === "2027-02-01")?.valorCentavos).toBe(49900);
  });

  it("carência negociada adia a suspensão", async () => {
    const { tenantId, ctx } = await novaClinica("Clínica Carência");
    await gerarFaturaDoMes(tenantId, { agora: new Date("2027-01-02T15:00:00Z"), gateway, database: db });
    const vinteDiasDepois = new Date("2027-01-30T15:00:00Z");
    expect((await situacaoDaAssinaturaDoEspaco(ctx, vinteDiasDepois, db)).estado).toBe("suspensa");
    await salvarCondicoesComerciais(financeiro, tenantId, { ...SEM_CONDICOES, diasCarencia: 30 }, db);
    expect(await situacaoDaAssinaturaDoEspaco(ctx, vinteDiasDepois, db)).toMatchObject({ estado: "atrasada", suspensaoEm: "2027-02-10" });
  });
});

describe("cupons", () => {
  it("só equipe financeira cria; o código é único e em maiúsculas", async () => {
    await expect(salvarCupom(suporte, null, { codigo: "nao", tipo: "percentual", valor: 10, duracaoMeses: null, validoAte: null, maxUsos: null }, db)).rejects.toThrow(
      "não permite",
    );
    await salvarCupom(financeiro, null, { codigo: "uniq10", tipo: "percentual", valor: 10, duracaoMeses: null, validoAte: null, maxUsos: null }, db);
    await expect(salvarCupom(financeiro, null, { codigo: "UNIQ10", tipo: "valor", valor: 500, duracaoMeses: null, validoAte: null, maxUsos: null }, db)).rejects.toThrow(
      "Já existe",
    );
    expect((await listarCupons(suporte, db)).find((c) => c.codigo === "UNIQ10")).toMatchObject({ tipo: "percentual", valor: 10, usos: 0 });
  });

  it("cupom aplicado pelo admin vale a partir da próxima fatura, pelos meses do cupom; respeita usos e plano", async () => {
    await salvarCupom(financeiro, null, { codigo: "DOISMESES", tipo: "valor", valor: 10000, duracaoMeses: 2, validoAte: null, maxUsos: 1 }, db);
    await salvarCupom(financeiro, null, { codigo: "SOBASICO", tipo: "percentual", valor: 50, duracaoMeses: 1, validoAte: null, maxUsos: null, planosIds: [planoBasico] }, db);

    const a = await novaClinica("Clínica Cupom A");
    await expect(aplicarCupomNoEspaco(a.ctx, "sobasico", db)).rejects.toThrow("não vale para o plano");
    await aplicarCupomNoEspaco(a.ctx, "doismeses", db);
    await expect(aplicarCupomNoEspaco(a.ctx, "UNIQ10", db)).rejects.toThrow("já tem um cupom");
    const [d] = await withTenant(a.ctx, (tx) => tx.select().from(descontosTenant), db);
    const mes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7) + "-01";
    expect(d).toMatchObject({ tipo: "valor", valor: 10000, competenciaInicio: mes, competenciaFim: primeiraCompetenciaCobrada(mes), motivo: "Cupom DOISMESES" });

    const b = await novaClinica("Clínica Cupom B");
    await expect(aplicarCupomNoEspaco(b.ctx, "DOISMESES", db)).rejects.toThrow("limite de usos");
    await expect(aplicarCupomNoEspaco({ ...b.ctx, role: "recepcao" as never }, "UNIQ10", db)).rejects.toThrow();
  });

  it("cupom no cadastro do espaço e no convite de teste (vale depois do teste)", async () => {
    await salvarCupom(financeiro, null, { codigo: "CADASTRO15", tipo: "percentual", valor: 15, duracaoMeses: 3, validoAte: null, maxUsos: null }, db);
    const dona = await criarUsuario(db, "Dona Cadastro Cupom");
    const { tenantId } = await criarTenantComAdmin(dona, { nomeTenant: "Com Cupom", documento: "529.982.247-25", cupom: "cadastro15" }, db);
    const ctx = { tenantId, userId: dona, role: "admin" as const };
    expect((await withTenant(ctx, (tx) => tx.select().from(descontosTenant), db))[0]).toMatchObject({ valor: 15, motivo: "Cupom CADASTRO15" });

    const outra = await criarUsuario(db, "Cupom Invalido Cadastro");
    await expect(criarTenantComAdmin(outra, { nomeTenant: "Sem Cupom", documento: "529.982.247-25", cupom: "NAOEXISTE" }, db)).rejects.toThrow("Cupom inválido");

    const convidada = await criarUsuario(db, "Convidada Com Cupom");
    const { token } = await criarConviteClinica(dono, { email: await emailDe(convidada), planoId: planoPro, diasTeste: 30, cupom: "cadastro15" }, new Date(), db);
    const t = await criarTenantComAdmin(convidada, { nomeTenant: "Teste Com Cupom", documento: "529.982.247-25", conviteTrial: token }, db);
    const [desconto] = await withTenant({ tenantId: t.tenantId, userId: convidada, role: "admin" }, (tx) => tx.select().from(descontosTenant), db);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const fimTeste = new Date(Date.parse(`${hoje}T12:00:00Z`) + 29 * 86_400_000).toISOString().slice(0, 10);
    expect(desconto.competenciaInicio).toBe(primeiraCompetenciaCobrada(fimTeste));
  });
});
