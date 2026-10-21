// E-mail transacional (verificação de conta, redefinição de senha, convites).
// EMAIL_PROVIDER: "resend" (produção, API HTTP do Resend) ou "console" (dev: registra no log
// do servidor, com o link, para dar para testar sem caixa de entrada).

export type MensagemEmail = { para: string; assunto: string; html: string; texto: string };

export interface ProvedorEmail {
  enviar(mensagem: MensagemEmail): Promise<void>;
}

export class ErroEmail extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroEmail";
  }
}

export class EmailResend implements ProvedorEmail {
  constructor(
    private readonly apiKey: string,
    private readonly remetente: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async enviar({ para, assunto, html, texto }: MensagemEmail) {
    const resposta = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.remetente, to: [para], subject: assunto, html, text: texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) {
      // O corpo do erro do Resend não contém o conteúdo da mensagem (só código e descrição).
      const detalhe = await resposta.text().catch(() => "");
      throw new ErroEmail(`Resend respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`);
    }
  }
}

/** Dev: só registra. Nunca em produção (src/env.ts recusa, salvo ambiente de demonstração). */
export class EmailConsole implements ProvedorEmail {
  async enviar({ para, assunto, texto }: MensagemEmail) {
    console.log(`[e-mail:console] Para: ${para} · ${assunto}\n${texto}\n`);
  }
}

/** Em memória: testes. */
export class EmailMemoria implements ProvedorEmail {
  readonly enviados: MensagemEmail[] = [];
  async enviar(mensagem: MensagemEmail) {
    this.enviados.push(mensagem);
  }
  ultimoPara(para: string): MensagemEmail | undefined {
    return this.enviados.findLast((m) => m.para === para);
  }
}

const globalEmail = globalThis as unknown as { salusEmail?: ProvedorEmail };

export function emailDoAmbiente(): ProvedorEmail {
  if (globalEmail.salusEmail) return globalEmail.salusEmail;
  const provedor = process.env.EMAIL_PROVIDER || "console";
  if (provedor === "resend") {
    const { RESEND_API_KEY, EMAIL_FROM } = process.env;
    if (!RESEND_API_KEY || !EMAIL_FROM) throw new ErroEmail("Configure RESEND_API_KEY e EMAIL_FROM para EMAIL_PROVIDER=resend");
    globalEmail.salusEmail = new EmailResend(RESEND_API_KEY, EMAIL_FROM);
  } else if (provedor === "console") {
    globalEmail.salusEmail = new EmailConsole();
  } else {
    throw new ErroEmail(`EMAIL_PROVIDER desconhecido: ${provedor}`);
  }
  return globalEmail.salusEmail;
}

/** Troca o provedor (testes). */
export function definirProvedorEmail(provedor: ProvedorEmail | undefined) {
  globalEmail.salusEmail = provedor;
}
