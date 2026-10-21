import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { ErroPermissao } from "../../src/domain/rbac";
import { avisarDatasNaoReservadas, listarDatasNaoReservadas, resolverDataNaoReservada } from "../../src/server/datas-nao-reservadas";
import { EmailMemoria } from "../../src/server/email";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { criarRecorrencia, criarReserva, materializarRecorrencias } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// C10: data da série que o worker não conseguiu reservar ao estender a janela.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda
const UMA_SEMANA_DEPOIS = new Date("2030-03-11T10:00:00Z");
// A janela inicial vai até 29/04 (segunda); estendida uma semana, inclui a terça 30/04.
const DATA_EM_CONFLITO = "2030-04-30";

let db: Database;
let admin: ContextoTenant;
let anaCtx: ContextoTenant;
let anaEmail: string;
let sala: string;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Datas");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Datas", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  anaEmail = `ana.${randomUUID()}@teste.dev`;
  const { id: ana } = await criarProfissional(admin, { nome: "Dra. Ana Lima", email: anaEmail }, db);
  const anaUser = await criarUsuario(db, "Ana Datas");
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId: anaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, ana));
    },
    db,
  );
  anaCtx = { tenantId, userId: anaUser, role: "profissional" };
  const { id: unidadeId } = await criarUnidade(admin, { nome: "Centro" }, db);
  ({ id: sala } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  await criarRecorrencia(admin, { salaId: sala, profissionalId: ana, dataInicio: "2030-03-05", horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
  // Fora da janela inicial, outro profissional ocupa a sala numa das próximas terças.
  const { id: beto } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db);
  await criarReserva(admin, { salaId: sala, profissionalId: beto, data: DATA_EM_CONFLITO, horaInicio: "09:00", horaFim: "11:00" }, AGORA, db);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("datas não reservadas (C10)", () => {
  it("o worker registra a data em conflito ao estender a série", async () => {
    const r = await withSistema(admin.tenantId, (tx) => materializarRecorrencias(tx, UMA_SEMANA_DEPOIS), db);
    expect(r.conflitos).toBe(1);
    // Rodar de novo não duplica.
    await withSistema(admin.tenantId, (tx) => materializarRecorrencias(tx, UMA_SEMANA_DEPOIS), db);
    const datas = await listarDatasNaoReservadas(admin, UMA_SEMANA_DEPOIS, db);
    expect(datas).toEqual([expect.objectContaining({ data: DATA_EM_CONFLITO, horaInicio: "08:00", horaFim: "10:00", salaNome: "Sala 1", profissionalNome: "Dra. Ana Lima" })]);
    expect(await listarDatasNaoReservadas(anaCtx, UMA_SEMANA_DEPOIS, db)).toHaveLength(1);
  });

  it("o profissional recebe um e-mail uma única vez", async () => {
    const email = new EmailMemoria();
    expect(await avisarDatasNaoReservadas(admin.tenantId, { agora: UMA_SEMANA_DEPOIS, provedor: email, database: db })).toEqual({ avisos: 1, datas: 1 });
    const mensagem = email.ultimoPara(anaEmail)!;
    expect(mensagem.assunto).toContain("não foram garantidas");
    expect(mensagem.texto).toContain("30/04/2030, 08:00–10:00 (Sala 1)");
    expect(mensagem.texto).toContain("Olá, Ana!");
    expect(await avisarDatasNaoReservadas(admin.tenantId, { agora: UMA_SEMANA_DEPOIS, provedor: email, database: db })).toEqual({ avisos: 0, datas: 0 });
  });

  it("só a equipe marca como resolvida; depois some das pendências", async () => {
    const [d] = await listarDatasNaoReservadas(admin, UMA_SEMANA_DEPOIS, db);
    expect(await capturarErro(resolverDataNaoReservada(anaCtx, d.id, UMA_SEMANA_DEPOIS, db))).toBeInstanceOf(ErroPermissao);
    await resolverDataNaoReservada(admin, d.id, UMA_SEMANA_DEPOIS, db);
    expect(await listarDatasNaoReservadas(admin, UMA_SEMANA_DEPOIS, db)).toEqual([]);
    await expect(resolverDataNaoReservada(admin, d.id, UMA_SEMANA_DEPOIS, db)).rejects.toThrow("não encontrada");
  });
});
