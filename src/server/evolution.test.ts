import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroEnvio } from "./provider";
import { EvolutionApi, EvolutionProvider, type ClienteWhatsappQr } from "./evolution";

type Chamada = { url: string; metodo: string; corpo: unknown; apikey: string | null };

/** fetch falso: responde pela rota e guarda as chamadas. */
function simular(rotas: Record<string, { status?: number; json: unknown }>) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const caminho = url.replace("https://evo.local", "");
      chamadas.push({
        url: caminho,
        metodo: init.method ?? "GET",
        corpo: init.body ? JSON.parse(String(init.body)) : undefined,
        apikey: new Headers(init.headers).get("apikey"),
      });
      const chave = `${init.method} ${caminho}`;
      const r = rotas[chave] ?? { status: 404, json: {} };
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
    }),
  );
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

const api = new EvolutionApi("https://evo.local/", "chave-global");

describe("EvolutionApi", () => {
  it("instância nova: cria com QR Code (Baileys) e devolve o base64", async () => {
    const chamadas = simular({
      "POST /instance/create": { status: 201, json: { instance: { instanceName: "salus-1" }, qrcode: { base64: "data:image/png;base64,AAA", pairingCode: "ABCD1234" } } },
    });
    expect(await api.conectar("salus-1")).toEqual({ qrBase64: "data:image/png;base64,AAA", codigoPareamento: "ABCD1234" });
    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual(["GET /instance/connectionState/salus-1", "POST /instance/create"]);
    expect(chamadas[1]).toMatchObject({ apikey: "chave-global", corpo: { instanceName: "salus-1", integration: "WHATSAPP-BAILEYS", qrcode: true } });
  });

  it("instância existente: pede um QR Code novo", async () => {
    simular({
      "GET /instance/connectionState/salus-1": { json: { instance: { state: "close" } } },
      "GET /instance/connect/salus-1": { json: { base64: "BBB", pairingCode: null } },
    });
    expect(await api.conectar("salus-1")).toEqual({ qrBase64: "BBB", codigoPareamento: null });
  });

  it("estado aberto traz o número do dono da instância", async () => {
    simular({
      "GET /instance/connectionState/salus-1": { json: { instance: { instanceName: "salus-1", state: "open" } } },
      "GET /instance/fetchInstances?instanceName=salus-1": { json: [{ name: "salus-1", ownerJid: "5511999990000@s.whatsapp.net" }] },
    });
    expect(await api.estado("salus-1")).toEqual({ estado: "open", numero: "5511999990000" });
  });

  it("sem instância, o estado é fechado", async () => {
    simular({});
    expect(await api.estado("salus-x")).toEqual({ estado: "close", numero: null });
  });

  it("envia texto para o número só com dígitos e devolve o id", async () => {
    const chamadas = simular({ "POST /message/sendText/salus-1": { status: 201, json: { key: { id: "MSG1" } } } });
    expect(await api.enviarTexto("salus-1", "+55 11 99999-0000", "Olá")).toEqual({ id: "MSG1" });
    expect(chamadas[0].corpo).toEqual({ number: "5511999990000", text: "Olá" });
  });
});

describe("EvolutionProvider", () => {
  const cliente = (erro: Error): ClienteWhatsappQr => ({
    conectar: vi.fn(),
    estado: vi.fn(),
    desconectar: vi.fn(),
    enviarTexto: vi.fn(async () => {
      throw erro;
    }),
  });

  it("monta o texto da mensagem e envia pela instância", async () => {
    const enviarTexto = vi.fn(async () => ({ id: "X" }));
    const provider = new EvolutionProvider({ conectar: vi.fn(), estado: vi.fn(), desconectar: vi.fn(), enviarTexto }, "salus-1");
    await provider.enviar({ para: "+5511999990000", tipo: "lembrete_reserva", parametros: { profissional: "Ana", sala: "Sala 1", data: "05/03/2030", hora: "09:00", local: "Centro" } });
    expect(enviarTexto).toHaveBeenCalledWith("salus-1", "+5511999990000", expect.stringContaining("Sala 1 em 05/03/2030 às 09:00"));
  });

  it("4xx é definitivo; rede e 5xx podem ser repetidos", async () => {
    simular({ "POST /message/sendText/salus-1": { status: 400, json: { response: { message: ["número sem WhatsApp"] } } } });
    const erro400 = await new EvolutionProvider(api, "salus-1").enviar({ para: "+551100", tipo: "lembrete_reserva", parametros: {} }).catch((e) => e);
    expect(erro400).toBeInstanceOf(ErroEnvio);
    expect(erro400.retentavel).toBe(false);
    const erroRede = await new EvolutionProvider(cliente(new Error("ECONNREFUSED")), "salus-1")
      .enviar({ para: "+551100", tipo: "lembrete_reserva", parametros: {} })
      .catch((e) => e);
    expect(erroRede.retentavel).toBe(true);
  });
});
