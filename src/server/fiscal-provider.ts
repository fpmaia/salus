// Emissor de NFS-e. "simulado" (sem credenciais) para desenvolvimento/testes e a Focus NFe
// (NFS-e Nacional, /v2/nfsen) em homologação ou produção.

export type ErroFiscal = { codigo?: string; mensagem: string; correcao?: string | null };

export type SituacaoNota =
  | { status: "processando" }
  | {
      status: "autorizada" | "cancelada";
      numero: string;
      codigoVerificacao: string | null;
      url: string | null;
      urlDanfse: string | null;
      caminhoXml: string | null;
      emitidaEm: Date | null;
    }
  | { status: "erro"; erros: ErroFiscal[] }
  | { status: "nao_encontrada" };

export class ErroComunicacaoFiscal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroComunicacaoFiscal";
  }
}

export interface EmissorNfse {
  /** Envia a DPS. "processando" = aceita para a fila; "erro" = recusada na pré-validação. */
  emitir(referencia: string, dps: Record<string, unknown>): Promise<SituacaoNota>;
  consultar(referencia: string): Promise<SituacaoNota>;
  cancelar(referencia: string, justificativa: string): Promise<{ status: "cancelada" } | { status: "erro"; erros: ErroFiscal[] }>;
}

/** Sem estado: a "nota" é autorizada na primeira consulta, com número derivado da referência. */
export class EmissorSimulado implements EmissorNfse {
  async emitir(_referencia: string, dps: Record<string, unknown>): Promise<SituacaoNota> {
    if (!dps.cpf_tomador && !dps.cnpj_tomador) return { status: "erro", erros: [{ codigo: "SIM01", mensagem: "Tomador sem CPF/CNPJ" }] };
    return { status: "processando" };
  }
  async consultar(referencia: string): Promise<SituacaoNota> {
    const numero = String(parseInt(referencia.replace(/\W/g, "").slice(-6), 16) % 100000);
    return {
      status: "autorizada",
      numero,
      codigoVerificacao: `SIM${numero}`,
      url: null,
      urlDanfse: null,
      caminhoXml: null,
      emitidaEm: new Date(),
    };
  }
  async cancelar(): Promise<{ status: "cancelada" }> {
    return { status: "cancelada" };
  }
}

type RespostaFocus = {
  status?: string;
  numero?: string | number;
  codigo_verificacao?: string;
  url?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
  data_emissao?: string;
  erros?: ErroFiscal[];
  codigo?: string;
  mensagem?: string;
};

export class EmissorFocusNfe implements EmissorNfse {
  private readonly base: string;
  constructor(
    private readonly token: string,
    ambiente: "homologacao" | "producao",
  ) {
    this.base = ambiente === "producao" ? "https://api.focusnfe.com.br/v2" : "https://homologacao.focusnfe.com.br/v2";
  }

  private async requisitar(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown) {
    let resposta: Response;
    try {
      resposta = await fetch(`${this.base}${caminho}`, {
        method: metodo,
        headers: {
          // HTTP Basic: token como usuário, senha em branco.
          Authorization: `Basic ${Buffer.from(`${this.token}:`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      throw new ErroComunicacaoFiscal(`Falha de rede com a Focus NFe: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    if (resposta.status === 401) throw new ErroComunicacaoFiscal("Token da Focus NFe recusado (401)");
    if (resposta.status >= 500 || resposta.status === 429) throw new ErroComunicacaoFiscal(`Focus NFe indisponível (HTTP ${resposta.status})`);
    const json = (await resposta.json().catch(() => ({}))) as RespostaFocus;
    return { http: resposta.status, json };
  }

  private situacao(json: RespostaFocus): SituacaoNota {
    switch (json.status) {
      case "processando_autorizacao":
        return { status: "processando" };
      case "autorizado":
      case "cancelado":
        return {
          status: json.status === "autorizado" ? "autorizada" : "cancelada",
          numero: String(json.numero ?? ""),
          codigoVerificacao: json.codigo_verificacao ?? null,
          url: json.url ?? null,
          urlDanfse: json.url_danfse ?? null,
          caminhoXml: json.caminho_xml_nota_fiscal ?? null,
          emitidaEm: json.data_emissao ? new Date(json.data_emissao) : null,
        };
      case "erro_autorizacao":
      case "negado":
        return { status: "erro", erros: json.erros?.length ? json.erros : [{ mensagem: `Nota ${json.status}` }] };
      default:
        return { status: "erro", erros: [{ codigo: json.codigo, mensagem: json.mensagem ?? `Resposta inesperada (${json.status})` }] };
    }
  }

  async emitir(referencia: string, dps: Record<string, unknown>): Promise<SituacaoNota> {
    const { http, json } = await this.requisitar("POST", `/nfsen?ref=${encodeURIComponent(referencia)}`, dps);
    if (http === 202 || http === 200 || http === 201) return this.situacao(json);
    // 400/422: pré-validação recusou (dados inválidos).
    return { status: "erro", erros: json.erros?.length ? json.erros : [{ codigo: json.codigo, mensagem: json.mensagem ?? `HTTP ${http}` }] };
  }

  async consultar(referencia: string): Promise<SituacaoNota> {
    const { http, json } = await this.requisitar("GET", `/nfsen/${encodeURIComponent(referencia)}`);
    if (http === 404) return { status: "nao_encontrada" };
    return this.situacao(json);
  }

  async cancelar(referencia: string, justificativa: string) {
    const { http, json } = await this.requisitar("DELETE", `/nfsen/${encodeURIComponent(referencia)}`, { justificativa });
    if (http === 200 && json.status === "cancelado") return { status: "cancelada" as const };
    return { status: "erro" as const, erros: json.erros?.length ? json.erros : [{ codigo: json.codigo, mensagem: json.mensagem ?? `HTTP ${http}` }] };
  }
}
