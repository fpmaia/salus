import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { fechamentos, notificacoesOutbox } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import type { ClienteWhatsappQr, EstadoInstancia } from "../../src/server/evolution";
import { criarAcordo, fecharCompetenciaEmLote, lancarAjuste } from "../../src/server/financeiro";
import { processarFila } from "../../src/server/notificacoes";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { conectarWhatsapp, conexaoWhatsapp, desconectarWhatsapp, providerDoTenant, verificarConexaoWhatsapp } from "../../src/server/whatsapp";
import { criarDbApp, criarUsuario } from "./helpers";

// WhatsApp por QR Code (Evolution API, falsa aqui) e fechamento do mês em lote.

const AGORA = new Date("2030-04-02T12:00:00Z");

/** Evolution falsa: o teste decide o estado da instância. */
class EvolutionFalsa implements ClienteWhatsappQr {
  estadoAtual: EstadoInstancia = "close";
  enviadas: { instancia: string; numero: string; texto: string }[] = [];
  async conectar() {
    this.estadoAtual = "connecting";
    return { qrBase64: "data:image/png;base64,QR", codigoPareamento: "WXYZ" };
  }
  async estado() {
    return { estado: this.estadoAtual, numero: this.estadoAtual === "open" ? "5511999990000" : null };
  }
  async enviarTexto(instancia: string, numero: string, texto: string) {
    this.enviadas.push({ instancia, numero, texto });
    return { id: `msg-${this.enviadas.length}` };
  }
  async desconectar() {
    this.estadoAtual = "close";
  }
}

let db: Database;
let admin: ContextoTenant;
const evolution = new EvolutionFalsa();
const opcoes = () => ({ cliente: evolution, database: db, agora: AGORA });

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin WhatsApp");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking WhatsApp", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
});

afterAll(async () => {
  await db?.$client.end();
});

describe("WhatsApp por QR Code", () => {
  it("sem Evolution configurada, a tela não oferece a conexão", async () => {
    expect(await conexaoWhatsapp(admin, { cliente: null, database: db })).toMatchObject({ disponivel: false, conexao: null });
    await expect(conectarWhatsapp(admin, { aceitoRisco: true }, { cliente: null, database: db })).rejects.toThrow("não está habilitado");
  });

  it("exige o aceite do risco e devolve o QR Code", async () => {
    await expect(conectarWhatsapp(admin, { aceitoRisco: false }, opcoes())).rejects.toThrow("risco de bloqueio");
    expect(await conectarWhatsapp(admin, { aceitoRisco: true }, opcoes())).toEqual({ qrBase64: "data:image/png;base64,QR", codigoPareamento: "WXYZ" });
    const { conexao } = await conexaoWhatsapp(admin, opcoes());
    expect(conexao).toMatchObject({ instancia: `salus-${admin.tenantId}`, status: "conectando", riscoAceitoPor: admin.userId });
    expect(conexao?.riscoAceitoEm?.toISOString()).toBe(AGORA.toISOString());
  });

  it("desconectado, o worker não envia: a mensagem espera na fila", async () => {
    await withTenant(
      admin,
      (tx) =>
        tx.insert(notificacoesOutbox).values({
          tipo: "lembrete_reserva",
          destinatario: "+5511988887777",
          agendarPara: AGORA,
          parametros: { profissional: "Ana", sala: "Sala 1", data: "03/04/2030", hora: "09:00", local: "Centro" },
          idempotencyKey: `teste:${randomUUID()}`,
        }),
      db,
    );
    expect(await providerDoTenant(admin.tenantId, evolution, AGORA, db)).toBeNull();
    expect((await conexaoWhatsapp(admin, opcoes())).pendentes).toBe(1);
  });

  it("ao ler o QR Code: grava conectado com o número e o worker envia pelo número do espaço", async () => {
    evolution.estadoAtual = "open";
    expect(await verificarConexaoWhatsapp(admin, opcoes())).toBe("conectado");
    expect((await conexaoWhatsapp(admin, opcoes())).conexao).toMatchObject({ status: "conectado", numero: "5511999990000" });

    const provider = await providerDoTenant(admin.tenantId, evolution, AGORA, db);
    expect(provider?.nome).toBe("evolution");
    expect(await processarFila(admin.tenantId, provider!, AGORA, 20, db)).toMatchObject({ enviadas: 1, falhas: 0 });
    expect(evolution.enviadas).toEqual([{ instancia: `salus-${admin.tenantId}`, numero: "+5511988887777", texto: expect.stringContaining("Sala 1") }]);
    // Fila vazia: nem consulta a Evolution.
    expect(await providerDoTenant(admin.tenantId, evolution, AGORA, db)).toBeNull();
  });

  it("o celular desconectou: o worker percebe e marca desconectado; o admin também pode desconectar", async () => {
    await withTenant(
      admin,
      (tx) =>
        tx.insert(notificacoesOutbox).values({ tipo: "lembrete_reserva", destinatario: "+5511988887777", agendarPara: AGORA, parametros: {}, idempotencyKey: `teste:${randomUUID()}` }),
      db,
    );
    evolution.estadoAtual = "close";
    expect(await providerDoTenant(admin.tenantId, evolution, AGORA, db)).toBeNull();
    expect((await conexaoWhatsapp(admin, opcoes())).conexao?.status).toBe("desconectado");
    await desconectarWhatsapp(admin, opcoes());
    expect((await conexaoWhatsapp(admin, opcoes())).conexao).toMatchObject({ status: "desconectado", numero: null });
  });
});

describe("fechamento em lote", () => {
  it("fecha todos os abertos; quem falha volta na lista sem impedir os outros", async () => {
    const ana = (await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev` }, db)).id;
    const beto = (await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db)).id;
    const carla = (await criarProfissional(admin, { nome: "Dra. Carla", email: `carla.${randomUUID()}@teste.dev` }, db)).id;
    // Ana: mensalidade de R$ 500 (só entra no fechamento). Beto: ajuste avulso em março.
    await criarAcordo(admin, { profissionalId: ana, modelo: "mensalidade", mensalidadeCentavos: 50000, horasIncluidas: 10, valorHoraCentavos: 4000, vigenteDe: "2030-02-01" }, db);
    await lancarAjuste(admin, { profissionalId: beto, data: "2030-03-10", natureza: "debito", valorCentavos: 2000, descricao: "Armário" }, db);
    // Carla tem fevereiro em aberto: março não pode ser fechado antes.
    await lancarAjuste(admin, { profissionalId: carla, data: "2030-02-10", natureza: "debito", valorCentavos: 1000, descricao: "Fevereiro" }, db);

    const { fechados, erros } = await fecharCompetenciaEmLote(admin, "2030-03", AGORA, db);
    expect(fechados.map((f) => `${f.nome}:${f.saldoFinal}`).sort()).toEqual(["Dr. Beto:2000", "Dra. Ana:50000"]);
    expect(erros).toEqual([{ profissionalId: carla, nome: "Dra. Carla", motivo: "Feche antes a competência 02/2030" }]);

    // Rodar de novo só tenta quem ficou aberto.
    const deNovo = await fecharCompetenciaEmLote(admin, "2030-03", AGORA, db);
    expect(deNovo.fechados).toEqual([]);
    expect(deNovo.erros.map((e) => e.nome)).toEqual(["Dra. Carla"]);
    const fechadosNoBanco = await withTenant(admin, (tx) => tx.select().from(fechamentos).where(eq(fechamentos.competencia, "2030-03-01")), db);
    expect(fechadosNoBanco).toHaveLength(2);
  });

  it("o mês corrente não pode ser fechado", async () => {
    const r = await fecharCompetenciaEmLote(admin, "2030-04", AGORA, db);
    expect(r.fechados).toEqual([]);
    expect(r.erros.every((e) => e.motivo.includes("depois que ele terminar"))).toBe(true);
  });
});
