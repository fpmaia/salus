import { ErroGateway, type CobrancaGateway, type GatewayCobranca, type NovaCobranca } from "../../src/server/asaas";

/** Gateway Asaas falso com estado, controlado pelo teste. */
export class GatewayFalso implements GatewayCobranca {
  readonly ambiente = "sandbox" as const;
  clientes: { id: string; cpfCnpj: string }[] = [];
  cobrancas = new Map<string, CobrancaGateway & { valor: number; cliente: string }>();
  /** Próximas N criações de cobrança "perdem a resposta" (o Asaas processou, a rede caiu). */
  perderResposta = 0;

  /** Prefixo dos ids: o id do pagamento é único no banco inteiro (entre arquivos de teste). */
  constructor(private readonly prefixo = "") {}

  async criarCliente(c: { cpfCnpj: string }) {
    const id = `cus_${this.clientes.length + 1}`;
    this.clientes.push({ id, cpfCnpj: c.cpfCnpj });
    return { id };
  }

  async criarCobranca(c: NovaCobranca) {
    const id = `pay_${this.prefixo}${this.cobrancas.size + 1}`;
    const cobranca = {
      id,
      status: "PENDING",
      removida: false,
      billingType: c.forma,
      invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
      bankSlipUrl: null,
      externalReference: c.referencia,
      valor: c.valorCentavos,
      cliente: c.cliente,
    };
    this.cobrancas.set(id, cobranca);
    if (this.perderResposta > 0) {
      this.perderResposta--;
      throw new ErroGateway("timeout", true);
    }
    return cobranca;
  }

  async consultarCobranca(id: string) {
    return this.cobrancas.get(id) ?? null;
  }

  async buscarPorReferencia(referencia: string) {
    return [...this.cobrancas.values()].find((c) => c.externalReference === referencia) ?? null;
  }

  async cancelarCobranca(id: string) {
    const c = this.cobrancas.get(id);
    if (c) c.removida = true;
  }

  /** Atualizações recebidas (valor/vencimento), para o teste conferir. */
  atualizacoes: { id: string; valorCentavos?: number; vencimento?: string }[] = [];

  async atualizarCobranca(id: string, m: { valorCentavos?: number; vencimento?: string }) {
    const c = this.cobrancas.get(id);
    if (!c || c.removida) throw new ErroGateway("cobrança não encontrada");
    if (m.valorCentavos !== undefined) c.valor = m.valorCentavos;
    this.atualizacoes.push({ id, ...m });
  }

  async obterPix(id: string) {
    const c = this.cobrancas.get(id);
    return c && c.billingType === "PIX" ? { copiaECola: `00020126PIX-FALSO-${id}` } : null;
  }

  /** Muda o status "no Asaas" (o teste simula o pagamento/estorno). */
  definirStatus(id: string, status: string, billingType = "PIX") {
    const c = this.cobrancas.get(id)!;
    c.status = status;
    c.billingType = billingType;
  }
}
