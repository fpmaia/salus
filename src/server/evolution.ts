import { textoDaMensagem } from "../domain/notificacoes";
import { ErroEnvio, type MensagemTemplate, type NotificationProvider } from "./provider";

// Evolution API (v2): WhatsApp conectado por QR Code, uma instância por espaço. Não é a API
// oficial do WhatsApp: o número pode ser bloqueado (o admin aceita o risco ao conectar).

export type EstadoInstancia = "open" | "connecting" | "close";

export interface ClienteWhatsappQr {
  /** Cria a instância (se não existir) e devolve o QR Code para parear. */
  conectar(instancia: string): Promise<{ qrBase64: string | null; codigoPareamento: string | null }>;
  estado(instancia: string): Promise<{ estado: EstadoInstancia; numero: string | null }>;
  enviarTexto(instancia: string, numero: string, texto: string): Promise<{ id: string }>;
  desconectar(instancia: string): Promise<void>;
}

export class ErroEvolution extends Error {
  constructor(
    message: string,
    readonly http?: number,
  ) {
    super(message);
    this.name = "ErroEvolution";
  }
}

type RespostaQr = { base64?: string | null; pairingCode?: string | null; qrcode?: { base64?: string | null; pairingCode?: string | null } };

export class EvolutionApi implements ClienteWhatsappQr {
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  private async requisitar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<{ http: number; json: T }> {
    let resposta: Response;
    try {
      resposta = await fetch(`${this.url.replace(/\/$/, "")}${caminho}`, {
        method: metodo,
        headers: { apikey: this.apiKey, "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (erro) {
      throw new ErroEvolution(`Falha de rede com a Evolution API: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    const json = (await resposta.json().catch(() => ({}))) as T & { response?: { message?: unknown } };
    if (resposta.status >= 400 && resposta.status !== 404) {
      throw new ErroEvolution(`Evolution API recusou (HTTP ${resposta.status}): ${JSON.stringify(json.response?.message ?? json).slice(0, 200)}`, resposta.status);
    }
    return { http: resposta.status, json };
  }

  async conectar(instancia: string) {
    const nome = encodeURIComponent(instancia);
    const { http } = await this.requisitar("GET", `/instance/connectionState/${nome}`);
    if (http === 404) {
      const { json } = await this.requisitar<RespostaQr>("POST", "/instance/create", {
        instanceName: instancia,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      return { qrBase64: json.qrcode?.base64 ?? null, codigoPareamento: json.qrcode?.pairingCode ?? null };
    }
    const { json } = await this.requisitar<RespostaQr>("GET", `/instance/connect/${nome}`);
    return { qrBase64: json.base64 ?? null, codigoPareamento: json.pairingCode ?? null };
  }

  async estado(instancia: string) {
    const nome = encodeURIComponent(instancia);
    const { http, json } = await this.requisitar<{ instance?: { state?: string } }>("GET", `/instance/connectionState/${nome}`);
    if (http === 404) return { estado: "close" as const, numero: null };
    const estado = (["open", "connecting"].includes(json.instance?.state ?? "") ? json.instance!.state : "close") as EstadoInstancia;
    let numero: string | null = null;
    if (estado === "open") {
      const { json: lista } = await this.requisitar<{ ownerJid?: string; owner?: string }[]>("GET", `/instance/fetchInstances?instanceName=${nome}`);
      const jid = Array.isArray(lista) ? (lista[0]?.ownerJid ?? lista[0]?.owner ?? null) : null;
      numero = jid ? jid.split("@")[0].replace(/\D/g, "") || null : null;
    }
    return { estado, numero };
  }

  async enviarTexto(instancia: string, numero: string, texto: string) {
    const { json } = await this.requisitar<{ key?: { id?: string } }>("POST", `/message/sendText/${encodeURIComponent(instancia)}`, {
      number: numero.replace(/\D/g, ""),
      text: texto,
    });
    const id = json.key?.id;
    if (!id) throw new ErroEvolution("Resposta sem id da mensagem");
    return { id };
  }

  async desconectar(instancia: string) {
    await this.requisitar("DELETE", `/instance/logout/${encodeURIComponent(instancia)}`);
  }
}

/** Cliente configurado por variáveis de ambiente (WHATSAPP_PROVIDER=evolution); null se não for o caso. */
export function evolutionDoAmbiente(): ClienteWhatsappQr | null {
  if (process.env.WHATSAPP_PROVIDER !== "evolution") return null;
  const url = process.env.EVOLUTION_API_URL;
  const chave = process.env.EVOLUTION_API_KEY;
  if (!url || !chave) throw new Error("EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórias (WHATSAPP_PROVIDER=evolution)");
  return new EvolutionApi(url, chave);
}

/** Nome da instância do espaço na Evolution. */
export const instanciaDoTenant = (tenantId: string) => `salus-${tenantId}`;

/** Envio pela instância do espaço: texto livre (a Evolution não usa templates). */
export class EvolutionProvider implements NotificationProvider {
  readonly nome = "evolution";
  constructor(
    private readonly cliente: ClienteWhatsappQr,
    private readonly instancia: string,
  ) {}

  async enviar(mensagem: MensagemTemplate) {
    try {
      return await this.cliente.enviarTexto(this.instancia, mensagem.para, textoDaMensagem(mensagem.tipo, mensagem.parametros));
    } catch (erro) {
      // 4xx (número sem WhatsApp, dados inválidos) não adianta repetir; rede e 5xx, sim.
      const http = erro instanceof ErroEvolution ? erro.http : undefined;
      const retentavel = http === undefined || http >= 500 || http === 429;
      throw new ErroEnvio(erro instanceof Error ? erro.message : String(erro), retentavel);
    }
  }
}
