// Gateway de cobrança. "simulado" (sem credenciais; pagamento simulado pela tela) e Asaas
// (sandbox ou produção, API v3, header access_token).

export type AmbienteAsaas = "simulado" | "sandbox" | "producao";

export type CobrancaGateway = {
  id: string;
  status: string; // status do Asaas (PENDING, RECEIVED…)
  removida: boolean;
  billingType: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  externalReference: string | null;
};

export type NovaCobranca = {
  cliente: string;
  forma: "PIX" | "BOLETO" | "UNDEFINED";
  valorCentavos: number;
  vencimento: string; // AAAA-MM-DD
  descricao: string;
  referencia: string; // externalReference
  multaBp?: number | null;
  jurosMesBp?: number | null;
};

export class ErroGateway extends Error {
  constructor(
    message: string,
    /** true = falha de comunicação (pode ter sido processada; consulte antes de repetir). */
    readonly incerto = false,
  ) {
    super(message);
    this.name = "ErroGateway";
  }
}

export interface GatewayCobranca {
  readonly ambiente: AmbienteAsaas;
  criarCliente(c: { nome: string; cpfCnpj: string; email?: string | null; telefone?: string | null; referencia: string }): Promise<{ id: string }>;
  criarCobranca(c: NovaCobranca): Promise<CobrancaGateway>;
  consultarCobranca(id: string): Promise<CobrancaGateway | null>;
  buscarPorReferencia(referencia: string): Promise<CobrancaGateway | null>;
  cancelarCobranca(id: string): Promise<void>;
}

/** Sem estado externo: devolve ids determinísticos; o pagamento é simulado pela tela. */
export class GatewaySimulado implements GatewayCobranca {
  readonly ambiente = "simulado" as const;
  async criarCliente(c: { referencia: string }) {
    return { id: `cus_sim_${c.referencia.replace(/\W/g, "").slice(-12)}` };
  }
  async criarCobranca(c: NovaCobranca): Promise<CobrancaGateway> {
    return {
      id: `pay_sim_${c.referencia.replace(/\W/g, "").slice(-16)}`,
      status: "PENDING",
      removida: false,
      billingType: c.forma,
      invoiceUrl: null,
      bankSlipUrl: null,
      externalReference: c.referencia,
    };
  }
  async consultarCobranca() {
    return null;
  }
  async buscarPorReferencia() {
    return null;
  }
  async cancelarCobranca() {}
}

type PagamentoAsaas = {
  id: string;
  status: string;
  deleted?: boolean;
  billingType?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
};

export class GatewayAsaas implements GatewayCobranca {
  private readonly base: string;
  constructor(
    private readonly apiKey: string,
    readonly ambiente: "sandbox" | "producao",
  ) {
    this.base = ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  }

  private async requisitar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<{ http: number; json: T }> {
    let resposta: Response;
    try {
      resposta = await fetch(`${this.base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: this.apiKey,
          // Obrigatório para contas criadas a partir de 13/06/2024.
          "User-Agent": "Salus",
          "Content-Type": "application/json",
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (erro) {
      throw new ErroGateway(`Falha de rede com o Asaas: ${erro instanceof Error ? erro.message : String(erro)}`, true);
    }
    if (resposta.status === 401) throw new ErroGateway("Chave de API do Asaas recusada (401). Confira a chave e o ambiente.");
    if (resposta.status >= 500 || resposta.status === 429) throw new ErroGateway(`Asaas indisponível (HTTP ${resposta.status})`, true);
    const json = (await resposta.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
    if (resposta.status >= 400 && resposta.status !== 404) {
      throw new ErroGateway(json.errors?.map((e) => e.description).filter(Boolean).join("; ") || `Asaas recusou (HTTP ${resposta.status})`);
    }
    return { http: resposta.status, json };
  }

  private paraCobranca(p: PagamentoAsaas): CobrancaGateway {
    return {
      id: p.id,
      status: p.status,
      removida: Boolean(p.deleted),
      billingType: p.billingType ?? null,
      invoiceUrl: p.invoiceUrl ?? null,
      bankSlipUrl: p.bankSlipUrl ?? null,
      externalReference: p.externalReference ?? null,
    };
  }

  async criarCliente(c: { nome: string; cpfCnpj: string; email?: string | null; telefone?: string | null; referencia: string }) {
    const { json } = await this.requisitar<{ id: string }>("POST", "/customers", {
      name: c.nome,
      cpfCnpj: c.cpfCnpj,
      email: c.email ?? undefined,
      mobilePhone: c.telefone ?? undefined,
      externalReference: c.referencia,
    });
    return { id: json.id };
  }

  async criarCobranca(c: NovaCobranca) {
    const { json } = await this.requisitar<PagamentoAsaas>("POST", "/payments", {
      customer: c.cliente,
      billingType: c.forma,
      value: c.valorCentavos / 100,
      dueDate: c.vencimento,
      description: c.descricao.slice(0, 500),
      externalReference: c.referencia,
      // Omitir multa/juros mantém o padrão da conta (enviar nulo sobrescreveria).
      ...(c.multaBp ? { fine: { value: c.multaBp / 100, type: "PERCENTAGE" } } : {}),
      ...(c.jurosMesBp ? { interest: { value: c.jurosMesBp / 100 } } : {}),
    });
    return this.paraCobranca(json);
  }

  async consultarCobranca(id: string) {
    const { http, json } = await this.requisitar<PagamentoAsaas>("GET", `/payments/${encodeURIComponent(id)}`);
    return http === 404 ? null : this.paraCobranca(json);
  }

  async buscarPorReferencia(referencia: string) {
    const { json } = await this.requisitar<{ data?: PagamentoAsaas[] }>("GET", `/payments?externalReference=${encodeURIComponent(referencia)}`);
    const [primeiro] = json.data ?? [];
    return primeiro ? this.paraCobranca(primeiro) : null;
  }

  async cancelarCobranca(id: string) {
    await this.requisitar("DELETE", `/payments/${encodeURIComponent(id)}`);
  }
}

/** Gateway da conta Asaas da plataforma (cobrança do SaaS), configurado por variáveis de ambiente. */
export function gatewayDaPlataforma(): GatewayCobranca {
  const ambiente = (process.env.ASAAS_AMBIENTE ?? "simulado") as AmbienteAsaas;
  if (ambiente === "simulado") return new GatewaySimulado();
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new Error("ASAAS_API_KEY não definida (ASAAS_AMBIENTE != simulado)");
  return new GatewayAsaas(chave, ambiente);
}
