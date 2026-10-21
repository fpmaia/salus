import { textoDaMensagem, type TipoMensagem } from "../domain/notificacoes";

// Provider de envio. "console" (padrão) só registra no log — desenvolvimento e testes.
// "meta" usa a WhatsApp Cloud API com templates aprovados no WhatsApp Manager.

export type MensagemTemplate = {
  para: string; // E.164
  tipo: TipoMensagem;
  parametros: Record<string, string>;
};

export interface NotificationProvider {
  readonly nome: string;
  enviar(mensagem: MensagemTemplate): Promise<{ id: string }>;
}

export class ErroEnvio extends Error {
  constructor(
    message: string,
    /** false = erro definitivo (ex.: número inválido): não adianta tentar de novo. */
    readonly retentavel = true,
  ) {
    super(message);
    this.name = "ErroEnvio";
  }
}

export class ConsoleProvider implements NotificationProvider {
  readonly nome = "console";
  readonly enviadas: MensagemTemplate[] = [];
  async enviar(mensagem: MensagemTemplate) {
    this.enviadas.push(mensagem);
    console.log(`[whatsapp:console] → ${mensagem.para}: ${textoDaMensagem(mensagem.tipo, mensagem.parametros)}`);
    return { id: `console-${Date.now()}-${this.enviadas.length}` };
  }
}

// Ordem dos parâmetros do corpo de cada template ({{1}}, {{2}}…), como cadastrado na Meta.
const ORDEM_PARAMETROS: Record<MensagemTemplate["tipo"], string[]> = {
  lembrete_agendamento: ["paciente", "profissional", "data", "hora", "local", "link"],
  lembrete_reserva: ["profissional", "sala", "data", "hora", "local"],
  cancelamento_agendamento: ["paciente", "profissional", "data", "hora", "motivo"],
  cancelamento_reserva: ["profissional", "sala", "data", "hora", "motivo"],
};

export class WhatsAppCloudProvider implements NotificationProvider {
  readonly nome = "meta";
  constructor(
    private readonly config: {
      token: string;
      phoneNumberId: string;
      templates: Record<MensagemTemplate["tipo"], string>;
      idioma: string;
      versaoApi?: string;
    },
  ) {}

  async enviar(mensagem: MensagemTemplate) {
    const url = `https://graph.facebook.com/${this.config.versaoApi ?? "v21.0"}/${this.config.phoneNumberId}/messages`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: mensagem.para.replace("+", ""),
        type: "template",
        template: {
          name: this.config.templates[mensagem.tipo],
          language: { code: this.config.idioma },
          components: [
            {
              type: "body",
              parameters: ORDEM_PARAMETROS[mensagem.tipo].map((chave) => ({ type: "text", text: mensagem.parametros[chave] ?? "" })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((erro: unknown) => {
      throw new ErroEnvio(`Falha de rede: ${erro instanceof Error ? erro.message : String(erro)}`);
    });
    const corpo = (await resposta.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!resposta.ok) {
      // 4xx (exceto 429) são definitivos: template inválido, número sem WhatsApp etc.
      const retentavel = resposta.status >= 500 || resposta.status === 429;
      throw new ErroEnvio(`HTTP ${resposta.status}: ${corpo.error?.message ?? "erro desconhecido"}`, retentavel);
    }
    const id = corpo.messages?.[0]?.id;
    if (!id) throw new ErroEnvio("Resposta sem id da mensagem");
    return { id };
  }
}

/** Provider configurado por variáveis de ambiente (WHATSAPP_PROVIDER=console|meta). */
export function providerDoAmbiente(): NotificationProvider {
  if (process.env.WHATSAPP_PROVIDER !== "meta") return new ConsoleProvider();
  const obrigatoria = (nome: string) => {
    const valor = process.env[nome];
    if (!valor) throw new Error(`${nome} não definida (WHATSAPP_PROVIDER=meta)`);
    return valor;
  };
  return new WhatsAppCloudProvider({
    token: obrigatoria("WHATSAPP_TOKEN"),
    phoneNumberId: obrigatoria("WHATSAPP_PHONE_NUMBER_ID"),
    templates: {
      lembrete_agendamento: process.env.WHATSAPP_TEMPLATE_AGENDAMENTO ?? "lembrete_agendamento",
      lembrete_reserva: process.env.WHATSAPP_TEMPLATE_RESERVA ?? "lembrete_reserva",
      cancelamento_agendamento: process.env.WHATSAPP_TEMPLATE_CANCELAMENTO_AGENDAMENTO ?? "cancelamento_agendamento",
      cancelamento_reserva: process.env.WHATSAPP_TEMPLATE_CANCELAMENTO_RESERVA ?? "cancelamento_reserva",
    },
    idioma: process.env.WHATSAPP_TEMPLATE_IDIOMA ?? "pt_BR",
  });
}
