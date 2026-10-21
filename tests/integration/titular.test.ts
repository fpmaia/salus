import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { opcoesAuth } from "../../src/auth/config";
import { createDb, type Database } from "../../src/db/client";
import { aceitesDocumentos, auditLog, notificacoesOutbox, pacientes, registrosClinicos, users } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { VERSAO_DOCUMENTOS } from "../../src/legal/documentos";
import { aceiteVigente, registrarAceite } from "../../src/server/aceites";
import { criarAgendamento } from "../../src/server/agendamentos";
import { definirProvedorEmail, EmailMemoria } from "../../src/server/email";
import { criarAcordo } from "../../src/server/financeiro";
import { agendarLembretes } from "../../src/server/notificacoes";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarPaciente, criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { criarReserva } from "../../src/server/reservas";
import { anonimizarPaciente, exportarDadosPaciente } from "../../src/server/titular";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { TEST_DATABASE_MIGRATOR_URL } from "./env";
import { codigoPg, criarDbApp, criarUsuario } from "./helpers";

// LGPD: aceite versionado dos documentos e direitos do titular (exportação e anonimização).

const AGORA = new Date("2030-03-04T15:00:00Z"); // segunda, 12:00 em São Paulo
const DEPOIS = new Date("2030-03-06T15:00:00Z"); // depois do atendimento de terça
const TER = "2030-03-05";

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let profissional: string;
let maria: string;
let comProntuario: string;

beforeAll(async () => {
  process.env.LINKS_SECRET = "segredo-de-teste-com-32-caracteres!!";
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Titular");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Titular", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  recepcao = { ...admin, role: "recepcao" };
  const { id: unidade } = await criarUnidade(admin, { nome: "Centro", endereco: "Rua A, 10" }, db);
  const { id: sala } = await criarSala(admin, unidade, { nome: "Sala 1" }, db);
  ({ id: profissional } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db));
  await criarAcordo(admin, { profissionalId: profissional, modelo: "consulta", valorConsultaCentavos: 3000, vigenteDe: "2030-01-01" }, db);
  ({ id: maria } = await criarPaciente(
    admin,
    { nome: "Maria Souza", cpf: "529.982.247-25", telefone: "11 99999-0000", email: "maria@exemplo.com", consentimentoLembretes: true },
    AGORA,
    db,
  ));
  ({ id: comProntuario } = await criarPaciente(admin, { nome: "Paulo Clínico", telefone: "11 98888-0000" }, AGORA, db));
  await criarReserva(admin, { salaId: sala, profissionalId: profissional, data: TER, horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
  await criarAgendamento(
    admin,
    { pacienteId: maria, profissionalId: profissional, data: TER, horaInicio: "08:00", horaFim: "09:00", observacao: "Prefere WhatsApp" },
    AGORA,
    db,
  );
  await withSistema(tenantId, (tx) => agendarLembretes(tx, AGORA), db);

  // Prontuário de outro paciente (direto como dono das tabelas: o admin não escreve prontuário).
  const migrador = createDb(TEST_DATABASE_MIGRATOR_URL, { max: 1 });
  await migrador.insert(registrosClinicos).values({ tenantId, pacienteId: comProntuario, profissionalId: profissional, conteudoCifrado: "v1.x" });
  await migrador.$client.end();
});

afterAll(async () => {
  await db?.$client.end();
});

describe("exportação dos dados do paciente", () => {
  it("traz cadastro, atendimentos e mensagens, sem conteúdo clínico, e fica auditada", async () => {
    const dados = await exportarDadosPaciente(admin, maria, AGORA, db);
    expect(dados.paciente).toMatchObject({ nome: "Maria Souza", cpf: "52998224725", email: "maria@exemplo.com" });
    expect(dados.atendimentos).toHaveLength(1);
    expect(dados.atendimentos[0]).toMatchObject({ profissional: "Dra. Ana", local: "Centro · Sala 1" });
    expect(dados.mensagensEnviadas.length).toBeGreaterThan(0);
    expect(dados.controlador.nome).toBe("Coworking Titular");
    expect(JSON.stringify(dados)).not.toContain("conteudo");
    const auditoria = await withTenant(admin, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "paciente.dados_exportados")), db);
    expect(auditoria.map((a) => a.entidadeId)).toContain(maria);
  });

  it("só o admin exerce os direitos do titular", async () => {
    await expect(exportarDadosPaciente(recepcao, maria, AGORA, db)).rejects.toThrow();
    await expect(anonimizarPaciente(recepcao, maria, { justificativa: "pedido por e-mail" }, DEPOIS, db)).rejects.toThrow();
  });
});

describe("anonimização", () => {
  it("recusa com atendimento futuro e com prontuário (guarda legal)", async () => {
    await expect(anonimizarPaciente(admin, maria, { justificativa: "pedido por e-mail" }, AGORA, db)).rejects.toThrow("atendimentos futuros");
    await expect(anonimizarPaciente(admin, comProntuario, { justificativa: "pedido por e-mail" }, DEPOIS, db)).rejects.toThrow("20 anos");
  });

  it("apaga dados pessoais do cadastro, das observações e das mensagens; mantém o histórico", async () => {
    const r = await anonimizarPaciente(admin, maria, { justificativa: "Pedido do titular por e-mail em 06/03" }, DEPOIS, db);
    expect(r.atendimentos).toBe(1);
    const [p] = await withTenant(admin, (tx) => tx.select().from(pacientes).where(eq(pacientes.id, maria)), db);
    expect(p).toMatchObject({ cpf: null, telefone: null, email: null, dataNascimento: null, ativo: false, consentimentoLembretes: false });
    expect(p.nome).toMatch(/^Paciente anonimizado /);
    expect(p.anonimizadoEm).toEqual(DEPOIS);

    const exportado = JSON.stringify(await exportarDadosPaciente(admin, maria, DEPOIS, db));
    expect(exportado).not.toMatch(/Maria|99999|maria@|52998224725|Prefere WhatsApp/);
    const mensagens = await withTenant(admin, (tx) => tx.select().from(notificacoesOutbox), db);
    expect(JSON.stringify(mensagens)).not.toMatch(/Maria|99999/);

    const [aud] = await withTenant(admin, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "paciente.anonimizado")), db);
    expect(JSON.stringify(aud.dados)).not.toContain("Maria");
  });

  it("é irreversível: nem o serviço nem um UPDATE direto mudam o cadastro", async () => {
    await expect(atualizarPaciente(admin, maria, { nome: "Maria Souza", ativo: true }, DEPOIS, db)).rejects.toThrow("anonimizado");
    const erro = await withTenant(admin, (tx) => tx.update(pacientes).set({ nome: "Maria" }).where(eq(pacientes.id, maria)), db).catch((e) => e);
    expect(codigoPg(erro)).toBe("P0001");
    await expect(anonimizarPaciente(admin, maria, { justificativa: "de novo, por engano" }, DEPOIS, db)).rejects.toThrow("já foi");
  });
});

describe("aceite versionado dos documentos", () => {
  const BASE = "http://localhost:3000";
  const auth = () => betterAuth({ ...opcoesAuth(db), baseURL: BASE, secret: "segredo-de-teste-com-mais-de-32-caracteres!" });
  const cadastrar = (email: string, cabecalhos: Record<string, string>) =>
    auth().handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "user-agent": "vitest", "x-real-ip": "203.0.113.9", ...cabecalhos },
        body: JSON.stringify({ name: "Nova Pessoa", email, password: "senha-forte-123" }),
      }),
    );

  beforeAll(() => definirProvedorEmail(new EmailMemoria()));
  afterAll(() => definirProvedorEmail(undefined));

  it("cadastro pela tela sem aceite da versão vigente é recusado", async () => {
    const email = `sem.aceite.${randomUUID()}@teste.dev`;
    expect((await cadastrar(email, {})).status).toBe(400);
    expect((await cadastrar(email, { "x-aceite-documentos": "1999-01-01" })).status).toBe(400);
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });

  it("com o aceite, cria a conta e guarda a prova (versão, IP, navegador)", async () => {
    const email = `com.aceite.${randomUUID()}@teste.dev`;
    expect((await cadastrar(email, { "x-aceite-documentos": VERSAO_DOCUMENTOS })).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    const [aceite] = await db.select().from(aceitesDocumentos).where(eq(aceitesDocumentos.userId, u.id));
    expect(aceite).toMatchObject({ versao: VERSAO_DOCUMENTOS, origem: "cadastro", ip: "203.0.113.9", userAgent: "vitest" });
    expect(await aceiteVigente(u.id, db)).toBe(true);
  });

  it("versão antiga não vale: precisa aceitar de novo; o registro é só de inclusão", async () => {
    const userId = await criarUsuario(db, "Usuario Antigo");
    await db.insert(aceitesDocumentos).values({ userId, versao: "2020-01-01", origem: "cadastro" });
    expect(await aceiteVigente(userId, db)).toBe(false);
    await registrarAceite(userId, "reaceite", { ip: "203.0.113.10" }, db);
    await registrarAceite(userId, "reaceite", {}, db); // idempotente
    expect(await aceiteVigente(userId, db)).toBe(true);
    const erro = await db.execute(sql`update aceites_documentos set versao = 'x' where user_id = ${userId}`).catch((e) => e);
    expect(codigoPg(erro)).toBe("42501");
  });
});
