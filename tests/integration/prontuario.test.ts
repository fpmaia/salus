import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "../../src/db/client";
import { auditLog, memberships, profissionais, registrosClinicos } from "../../src/db/schema";
import { type ContextoTenant, withProntuario, withTenant } from "../../src/db/tenant";
import { ArmazenamentoMemoria } from "../../src/server/armazenamento";
import { chaveDoTenant, cifrarTexto } from "../../src/server/chave-tenant";
import { ErroNegocio } from "../../src/server/erros";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { atualizarProfissional, criarProfissional } from "../../src/server/profissionais";
import {
  acessosAoProntuario,
  anexarArquivo,
  baixarAnexo,
  compartilharProntuario,
  criarAdendo,
  descartarRascunho,
  exportarProntuario,
  finalizarRegistro,
  lerSolicitacao,
  obterProntuario,
  revogarCompartilhamento,
  salvarRascunho,
  solicitarProntuario,
} from "../../src/server/prontuario";
import { capturarErro, codigoPg, criarDbApp, criarUsuario, SEM_PRIVILEGIO } from "./helpers";
import { TEST_DATABASE_MIGRATOR_URL } from "./env";

// Prontuário: RLS por profissional, conteúdo cifrado, imutabilidade com hash, adendo,
// anexos cifrados, compartilhamento consentido, auditoria e solicitação formal do admin.

const AGORA = new Date("2030-03-05T15:00:00Z");

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
const ctx: Record<"ana" | "beto", ContextoTenant> = {} as never;
const prof: Record<"ana" | "beto", string> = { ana: "", beto: "" };
let paciente: string;
let evolucao: string;
const armazenamento = new ArmazenamentoMemoria();

async function vincularUsuario(nome: "ana" | "beto") {
  const userId = await criarUsuario(db, `Prof ${nome}`);
  ({ id: prof[nome] } = await criarProfissional(admin, { nome: `Dra. ${nome}`, email: `${nome}.${randomUUID()}@teste.dev` }, db));
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, prof[nome]));
    },
    db,
  );
  ctx[nome] = { tenantId: admin.tenantId, userId, role: "profissional" };
}

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 3).toString("base64");
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Prontuario");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Clínico", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  recepcao = { tenantId, userId: adminId, role: "recepcao" };
  await vincularUsuario("ana");
  await vincularUsuario("beto");
  ({ id: paciente } = await criarPaciente(ctx.ana, { nome: "Paciente Sigiloso" }, AGORA, db));
});

afterAll(async () => {
  await db?.$client.end();
});

describe("evolução", () => {
  it("rascunho é editável; finalizar gera hash e torna imutável", async () => {
    ({ id: evolucao } = await salvarRascunho(ctx.ana, { pacienteId: paciente, anotacoes: "Primeira sessão", prescricao: "" }, { database: db }));
    await salvarRascunho(ctx.ana, { registroId: evolucao, pacienteId: paciente, anotacoes: "Primeira sessão: queixa de ansiedade", prescricao: "Higiene do sono" }, { database: db });
    const { hash } = await finalizarRegistro(ctx.ana, evolucao, { agora: AGORA, database: db });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const { registros } = await obterProntuario(ctx.ana, paciente, { database: db });
    expect(registros[0]).toMatchObject({
      status: "finalizado",
      integro: true,
      conteudo: { anotacoes: "Primeira sessão: queixa de ansiedade", prescricao: "Higiene do sono" },
    });
    await expect(salvarRascunho(ctx.ana, { registroId: evolucao, pacienteId: paciente, anotacoes: "alterado" }, { database: db })).rejects.toThrow("use um adendo");
  });

  it("o banco recusa alterar ou apagar registro finalizado", async () => {
    const update = await capturarErro(
      withProntuario(ctx.ana, prof.ana, (tx) => tx.update(registrosClinicos).set({ conteudoCifrado: "x" }).where(eq(registrosClinicos.id, evolucao)), { database: db }),
    );
    const remocao = await capturarErro(
      withProntuario(ctx.ana, prof.ana, (tx) => tx.delete(registrosClinicos).where(eq(registrosClinicos.id, evolucao)), { database: db }),
    );
    expect(codigoPg(update)).toBe("P0001");
    expect(codigoPg(remocao)).toBe("P0001");
  });

  it("o conteúdo fica cifrado no banco", async () => {
    const migrador = createDb(TEST_DATABASE_MIGRATOR_URL, { max: 1 });
    const { rows } = await migrador.execute<{ c: string }>(sql`select conteudo_cifrado as c from registros_clinicos where id = ${evolucao}`);
    await migrador.$client.end();
    expect(rows[0].c).not.toContain("ansiedade");
  });

  it("correção é adendo vinculado ao original", async () => {
    const { id } = await criarAdendo(ctx.ana, evolucao, { anotacoes: "Correção: queixa de insônia", prescricao: "" }, { database: db });
    await finalizarRegistro(ctx.ana, id, { agora: AGORA, database: db });
    const { registros } = await obterProntuario(ctx.ana, paciente, { database: db });
    expect(registros.find((r) => r.id === id)).toMatchObject({ tipo: "adendo", adendoDe: evolucao, integro: true });
  });

  it("descartar só vale para rascunho", async () => {
    const { id } = await salvarRascunho(ctx.ana, { pacienteId: paciente, anotacoes: "rascunho descartável" }, { database: db });
    await descartarRascunho(ctx.ana, id, { database: db });
    await expect(descartarRascunho(ctx.ana, evolucao, { database: db })).rejects.toThrow("use um adendo");
  });
});

describe("sigilo", () => {
  it("outro profissional não lê nada sem compartilhamento (RLS)", async () => {
    const lidos = await withProntuario(ctx.beto, prof.beto, (tx) => tx.select().from(registrosClinicos), { database: db });
    expect(lidos).toEqual([]);
    await expect(obterProntuario(ctx.beto, paciente, { database: db })).rejects.toThrow("Paciente não encontrado");
  });

  it("admin e recepção não leem conteúdo clínico", async () => {
    expect(await withTenant(admin, (tx) => tx.select().from(registrosClinicos), db)).toEqual([]);
    const erro = await capturarErro(obterProntuario(admin, paciente, { database: db }));
    expect((erro as Error).name).toBe("ErroPermissao");
    expect(await withTenant(recepcao, (tx) => tx.select().from(registrosClinicos), db)).toEqual([]);
  });

  it("ninguém grava registro em nome de outro profissional", async () => {
    const erro = await capturarErro(
      withProntuario(ctx.beto, prof.beto, (tx) => tx.insert(registrosClinicos).values({ pacienteId: paciente, profissionalId: prof.ana, conteudoCifrado: "x" }), { database: db }),
    );
    expect(codigoPg(erro)).toBe(SEM_PRIVILEGIO);
  });

  it("compartilhamento consentido libera só os finalizados; revogar fecha", async () => {
    await salvarRascunho(ctx.ana, { pacienteId: paciente, anotacoes: "rascunho privado" }, { database: db });
    const { id } = await compartilharProntuario(ctx.ana, { pacienteId: paciente, paraProfissionalId: prof.beto, consentimento: "Termo assinado pelo paciente em 05/03/2030" }, { database: db });
    const visao = await obterProntuario(ctx.beto, paciente, { database: db });
    expect(visao.registros.length).toBe(2);
    expect(visao.registros.every((r) => r.status === "finalizado" && !r.proprio && r.autorNome === "Dra. ana")).toBe(true);

    await revogarCompartilhamento(ctx.ana, id, { database: db });
    expect((await obterProntuario(ctx.beto, paciente, { database: db })).registros).toEqual([]);
  });

  it("toda leitura fica no audit_log", async () => {
    const leituras = await withTenant(admin, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "prontuario.lido")), db);
    expect(leituras.length).toBeGreaterThanOrEqual(4);
    expect(new Set(leituras.map((l) => l.entidadeId))).toEqual(new Set([paciente]));
  });
});

describe("integridade e anexos", () => {
  it("anexo é cifrado no armazenamento, baixado intacto e só entra em rascunho", async () => {
    const { id: registro } = await salvarRascunho(ctx.ana, { pacienteId: paciente, anotacoes: "Exame trazido" }, { database: db });
    const pdf = Buffer.from("%PDF-1.4 laudo confidencial");
    const { id: anexo } = await anexarArquivo(ctx.ana, registro, { nome: "laudo.pdf", tipo: "application/pdf", dados: pdf }, { armazenamento, database: db });
    const [guardado] = [...armazenamento.objetos.values()];
    expect(guardado.includes(Buffer.from("confidencial"))).toBe(false);

    const baixado = await baixarAnexo(ctx.ana, anexo, { armazenamento, database: db });
    expect(baixado.dados.equals(pdf)).toBe(true);
    const acessos = await acessosAoProntuario(admin, paciente, db);
    expect(acessos.some((a) => a.acao === "prontuario.anexo_baixado" && a.usuarioNome)).toBe(true);
    expect(acessos.some((a) => a.acao === "prontuario.lido")).toBe(true);
    await expect(acessosAoProntuario(recepcao, paciente, db)).rejects.toThrow();
    await finalizarRegistro(ctx.ana, registro, { agora: AGORA, database: db });
    await expect(
      anexarArquivo(ctx.ana, registro, { nome: "outro.pdf", tipo: "application/pdf", dados: pdf }, { armazenamento, database: db }),
    ).rejects.toThrow("rascunho");
    await expect(
      anexarArquivo(ctx.ana, registro, { nome: "x.exe", tipo: "application/x-msdownload", dados: pdf }, { armazenamento, database: db }),
    ).rejects.toThrow("Formato não aceito");
    await expect(baixarAnexo(ctx.beto, anexo, { armazenamento, database: db })).rejects.toThrow("não encontrado");
  });

  it("adulteração por fora da aplicação é detectada pelo hash", async () => {
    const migrador = createDb(TEST_DATABASE_MIGRATOR_URL, { max: 1 });
    const falso = await withTenant(admin, async (tx) => cifrarTexto(await chaveDoTenant(tx), JSON.stringify({ anotacoes: "texto trocado", prescricao: "" })), db);
    await migrador.execute(sql`alter table registros_clinicos disable trigger registros_clinicos_protecao`);
    await migrador.execute(sql`update registros_clinicos set conteudo_cifrado = ${falso} where id = ${evolucao}`);
    await migrador.execute(sql`alter table registros_clinicos enable trigger registros_clinicos_protecao`);
    await migrador.$client.end();
    const { registros } = await obterProntuario(ctx.ana, paciente, { database: db });
    expect(registros.find((r) => r.id === evolucao)?.integro).toBe(false);
  });
});

describe("exportação e solicitação formal", () => {
  it("o profissional exporta só os finalizados", async () => {
    const { registros } = await exportarProntuario(ctx.ana, paciente, { database: db });
    expect(registros.every((r) => r.status === "finalizado")).toBe(true);
  });

  it("admin só solicita prontuário de profissional desligado, com justificativa, e o acesso expira", async () => {
    const dados = { profissionalId: prof.ana, pacienteId: paciente, justificativa: "Paciente solicitou cópia integral do prontuário (protocolo 123)" };
    await expect(solicitarProntuario(admin, dados, db)).rejects.toThrow("desligado");
    await atualizarProfissional(admin, prof.ana, { nome: "Dra. ana", email: (await emailDe(prof.ana))!, ativo: false }, db);

    const { solicitacaoId } = await solicitarProntuario(admin, dados, db);
    const liberado = await lerSolicitacao(admin, solicitacaoId, { database: db }); // a solicitação é gravada com a hora real
    expect(liberado.registros.length).toBeGreaterThanOrEqual(3);
    expect(liberado.solicitacao).toMatchObject({ profissionalNome: "Dra. ana" });

    const depois = new Date(Date.now() + 2 * 3_600_000);
    await expect(lerSolicitacao(admin, solicitacaoId, { agora: depois, database: db })).rejects.toThrow(ErroNegocio);
    await expect(solicitarProntuario(recepcao, dados, db)).rejects.toThrow();
    // Desligada, a profissional não acessa mais o prontuário pelo sistema.
    await expect(obterProntuario(ctx.ana, paciente, { database: db })).rejects.toThrow("não está ativo");
  });
});

async function emailDe(id: string) {
  const [p] = await withTenant(admin, (tx) => tx.select({ email: profissionais.email }).from(profissionais).where(eq(profissionais.id, id)), db);
  return p?.email;
}
