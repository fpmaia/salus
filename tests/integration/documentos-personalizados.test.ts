import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import {
  excluirModelo,
  listarModelos,
  obterPapelTimbrado,
  restaurarPapelTimbrado,
  salvarModelo,
  salvarPapelTimbrado,
  timbradoDoDocumento,
} from "../../src/server/documentos-personalizados";
import { definirModulos } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { criarUnidade } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";

// Modelos de documento (clínica x profissional) e papel timbrado com logo.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
const ctx: Record<"ana" | "beto", ContextoTenant> = {} as never;
const prof: Record<"ana" | "beto", string> = { ana: "", beto: "" };
let outroAdmin: ContextoTenant;

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
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Documentos");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Clínica Bem Estar", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  recepcao = { tenantId, userId: adminId, role: "recepcao" };
  await definirModulos(admin, { fiscal: false, agendaOnline: false, prontuario: true }, db);
  await criarUnidade(admin, { nome: "Centro", cep: "01310100", logradouro: "Avenida Paulista", numero: "1000", cidade: "São Paulo", uf: "SP" }, db);
  await vincularUsuario("ana");
  await vincularUsuario("beto");

  const outroId = await criarUsuario(db, "Admin Outro");
  const outro = await criarTenantComAdmin(outroId, { nomeTenant: "Outra Clínica", documento: "11.444.777/0001-61" }, db);
  outroAdmin = { tenantId: outro.tenantId, userId: outroId, role: "admin" };
  await definirModulos(outroAdmin, { fiscal: false, agendaOnline: false, prontuario: true }, db);
});

describe("modelos de documento", () => {
  it("admin mantém os da clínica; profissional, os seus; cada um vê o que deve", async () => {
    await salvarModelo(admin, "clinica", null, { nome: "Atestado da clínica", titulo: "Atestado", anotacoes: "Atesto que…" }, db);
    const { id: daAna } = await salvarModelo(ctx.ana, "meu", null, { nome: "Laudo da Ana", titulo: "Laudo", anotacoes: "Laudo…" }, db);

    const vistaAna = await listarModelos(ctx.ana, db);
    expect(vistaAna.clinica.map((m) => m.nome)).toEqual(["Atestado da clínica"]);
    expect(vistaAna.meus.map((m) => m.nome)).toEqual(["Laudo da Ana"]);

    const vistaBeto = await listarModelos(ctx.beto, db);
    expect(vistaBeto.meus).toEqual([]);
    expect(vistaBeto.clinica).toHaveLength(1);

    // Beto não altera nem exclui o modelo da Ana.
    await expect(salvarModelo(ctx.beto, "meu", daAna, { nome: "Roubado", anotacoes: "x" }, db)).rejects.toThrow("Modelo não encontrado");
    await expect(excluirModelo(ctx.beto, "meu", daAna, db)).rejects.toThrow("Modelo não encontrado");

    const vistaAdmin = await listarModelos(admin, db);
    expect(vistaAdmin.podeEditarClinica).toBe(true);
    expect(vistaAdmin.meus).toEqual([]);
  });

  it("só o admin mexe nos modelos da clínica; a recepção não acessa", async () => {
    await expect(salvarModelo(ctx.ana, "clinica", null, { nome: "Tentativa", anotacoes: "x" }, db)).rejects.toThrow();
    await expect(listarModelos(recepcao, db)).rejects.toThrow();
  });

  it("excluir esconde o modelo; outro espaço não vê nada", async () => {
    const { id } = await salvarModelo(ctx.ana, "meu", null, { nome: "Temporário", anotacoes: "x" }, db);
    await excluirModelo(ctx.ana, "meu", id, db);
    expect((await listarModelos(ctx.ana, db)).meus.map((m) => m.nome)).not.toContain("Temporário");
    const vistaOutro = await listarModelos(outroAdmin, db);
    expect(vistaOutro.clinica).toEqual([]);
  });

  it("modelo precisa de título ou texto", async () => {
    await expect(salvarModelo(ctx.ana, "meu", null, { nome: "Vazio" }, db)).rejects.toThrow("título ou de um texto");
  });
});

describe("papel timbrado", () => {
  it("sem personalização usa o padrão com os dados do profissional e da unidade", async () => {
    const t = await timbradoDoDocumento(ctx.ana, prof.ana, db);
    expect(t.cabecalho[0]).toBe("Clínica Bem Estar");
    expect(t.rodape[0]).toContain("Avenida Paulista, 1000");
    expect(t.logo).toBeNull();
  });

  it("o da clínica vale para todos; o do profissional tem prioridade", async () => {
    await salvarPapelTimbrado(admin, "clinica", { cabecalho: "{clinica}\nCuidado integral", rodape: "{endereco}", mostrarLogo: true, logo: PNG }, db);
    const doBeto = await timbradoDoDocumento(ctx.beto, prof.beto, db);
    expect(doBeto.cabecalho).toEqual(["Clínica Bem Estar", "Cuidado integral"]);
    expect(doBeto.logo).toMatch(/^data:image\/png;base64,/);

    // O editor do profissional começa como cópia do da clínica, sem estar personalizado.
    const editorAna = await obterPapelTimbrado(ctx.ana, "meu", db);
    expect(editorAna.personalizado).toBe(false);
    expect(editorAna.cabecalho).toBe("{clinica}\nCuidado integral");

    await salvarPapelTimbrado(ctx.ana, "meu", { cabecalho: "{profissional}\n{especialidade}", rodape: "", alinhamento: "esquerda" }, db);
    const daAna = await timbradoDoDocumento(ctx.ana, prof.ana, db);
    expect(daAna.alinhamento).toBe("esquerda");
    expect(daAna.logo).toBeNull(); // a Ana não enviou logo
    expect((await timbradoDoDocumento(ctx.beto, prof.beto, db)).cabecalho[1]).toBe("Cuidado integral");

    // Voltar ao da clínica.
    await restaurarPapelTimbrado(ctx.ana, "meu", db);
    expect((await timbradoDoDocumento(ctx.ana, prof.ana, db)).cabecalho[1]).toBe("Cuidado integral");
  });

  it("logo: mantém ao salvar sem arquivo, remove quando pedido e recusa formato inválido", async () => {
    await salvarPapelTimbrado(admin, "clinica", { cabecalho: "{clinica}", rodape: "", mostrarLogo: true }, db);
    expect((await obterPapelTimbrado(admin, "clinica", db)).logo).not.toBeNull();
    await salvarPapelTimbrado(admin, "clinica", { cabecalho: "{clinica}", rodape: "", mostrarLogo: true, removerLogo: true }, db);
    const semLogo = await obterPapelTimbrado(admin, "clinica", db);
    expect(semLogo.logo).toBeNull();
    expect(semLogo.mostrarLogo).toBe(false);
    await expect(
      salvarPapelTimbrado(admin, "clinica", { cabecalho: "", rodape: "", logo: new TextEncoder().encode("<svg/>") }, db),
    ).rejects.toThrow("PNG, JPG ou WebP");
  });

  it("profissional não altera o da clínica", async () => {
    await expect(salvarPapelTimbrado(ctx.ana, "clinica", { cabecalho: "x", rodape: "" }, db)).rejects.toThrow();
  });
});
