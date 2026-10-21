import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { cobrancasProfissional, configuracoesCobranca, eventosWebhook, lancamentos, profissionais } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { formaDaBaixa, mapearStatusAsaas, vencimentoPadrao, type StatusCobranca } from "../domain/cobranca";
import { formatarMoeda } from "../domain/dinheiro";
import { exigirPermissao, pode } from "../domain/rbac";
import { dataValida } from "../domain/tempo";
import { ErroGateway, GatewayAsaas, GatewaySimulado, type CobrancaGateway, type GatewayCobranca } from "./asaas";
import { cifrar, decifrar } from "./cripto";
import { ErroNegocio } from "./erros";
import { hojeDoEspaco } from "./fuso";
import { estornarPagamento, inserirPagamento } from "./financeiro";
import { urlPublica } from "./links";
import { profissionalDoUsuario } from "./profissionais";

type LinhaConfig = typeof configuracoesCobranca.$inferSelect;
type LinhaCobranca = typeof cobrancasProfissional.$inferSelect;
export type FabricaGateway = (config: LinhaConfig) => GatewayCobranca;

export const gatewayDoTenant: FabricaGateway = (config) => {
  if (config.ambiente === "simulado") return new GatewaySimulado();
  if (!config.apiKeyCifrada) throw new ErroNegocio("Chave de API do Asaas não configurada");
  return new GatewayAsaas(decifrar(config.apiKeyCifrada), config.ambiente);
};

type Opcoes = { agora?: Date; fabrica?: FabricaGateway; database?: Database };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------
// Configuração (conta Asaas do espaço)
// ---------------------------------------------------------------------------

export async function obterConfigCobranca(ctx: ContextoTenant, database?: Database) {
  exigirPermissao(ctx.role, "cobrancas.gerenciar");
  return withTenant(
    ctx,
    async (tx) => {
      const [c] = await tx.select().from(configuracoesCobranca);
      if (!c) return null;
      const { apiKeyCifrada, webhookTokenHash, ...resto } = c;
      return { ...resto, apiKeyConfigurada: Boolean(apiKeyCifrada), webhookConfigurado: Boolean(webhookTokenHash) };
    },
    database,
  );
}

export const configCobrancaSchema = z.object({
  ativo: z.boolean(),
  ambiente: z.enum(["simulado", "sandbox", "producao"]),
  /** Vazio = mantém; "-" = remove. */
  apiKey: z.string().trim().optional(),
  diasVencimento: z.number().int().min(1).max(60),
  multaBp: z.number().int().min(1).max(1000).nullable(),
  jurosMesBp: z.number().int().min(1).max(1000).nullable(),
});

export async function salvarConfigCobranca(ctx: ContextoTenant, dados: z.input<typeof configCobrancaSchema>, database?: Database) {
  exigirPermissao(ctx.role, "tenant.configurar");
  const { apiKey, ...valores } = configCobrancaSchema.parse(dados);
  await withTenant(
    ctx,
    async (tx) => {
      const apiKeyCifrada = apiKey === "-" ? null : apiKey ? cifrar(apiKey) : undefined;
      const conjunto = { ...valores, ...(apiKeyCifrada === undefined ? {} : { apiKeyCifrada }) };
      await tx.insert(configuracoesCobranca).values(conjunto).onConflictDoUpdate({ target: configuracoesCobranca.tenantId, set: conjunto });
      const [c] = await tx.select().from(configuracoesCobranca);
      if (c.ativo && c.ambiente !== "simulado" && !c.apiKeyCifrada) throw new ErroNegocio("Informe a chave de API do Asaas para ativar");
      await registrarAuditoria(tx, { acao: "cobranca.configurada", entidade: "configuracoes_cobranca", dados: { ...valores, chaveAlterada: apiKeyCifrada !== undefined } });
    },
    database,
  );
}

/** Gera (ou troca) o token do webhook. Mostrado uma única vez para cadastrar no painel do Asaas. */
export async function gerarTokenWebhook(ctx: ContextoTenant, database?: Database): Promise<{ url: string; token: string }> {
  exigirPermissao(ctx.role, "tenant.configurar");
  const token = randomBytes(24).toString("base64url");
  await withTenant(
    ctx,
    async (tx) => {
      const alteradas = await tx
        .update(configuracoesCobranca)
        .set({ webhookTokenHash: hashToken(token) })
        .returning({ id: configuracoesCobranca.id });
      if (alteradas.length === 0) throw new ErroNegocio("Salve a configuração antes de gerar o token");
      await registrarAuditoria(tx, { acao: "cobranca.webhook_token", entidade: "configuracoes_cobranca" });
    },
    database,
  );
  return { url: `${urlPublica()}/api/webhooks/asaas/${ctx.tenantId}`, token };
}

// ---------------------------------------------------------------------------
// Criação, cancelamento e simulação
// ---------------------------------------------------------------------------

export const novaCobrancaSchema = z.object({
  profissionalId: z.uuid(),
  valorCentavos: z.number("Informe o valor").int().positive("O valor deve ser maior que zero"),
  vencimento: z.string().refine(dataValida, "Vencimento inválido").optional(),
  forma: z.enum(["PIX", "BOLETO", "UNDEFINED"]).default("UNDEFINED"),
  descricao: z.string().trim().max(500).optional(),
  competencia: z.string().refine(dataValida).optional(),
});

/** Envia a cobrança ao gateway (criando o cliente se preciso). Consulta pela referência antes, para não duplicar. */
async function enviarAoGateway(tenantId: string, cobrancaId: string, fabrica: FabricaGateway, database: Database): Promise<LinhaCobranca> {
  const { cobranca, config, profissional } = await withSistema(
    tenantId,
    async (tx) => {
      const [c] = await tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, cobrancaId));
      const [cfg] = await tx.select().from(configuracoesCobranca);
      const [p] = await tx.select().from(profissionais).where(eq(profissionais.id, c.profissionalId));
      return { cobranca: c, config: cfg, profissional: p };
    },
    database,
  );
  const gateway = fabrica({ ...config, ambiente: cobranca.ambiente });
  const referencia = `cobranca:${cobranca.id}`;
  let remota: CobrancaGateway | null = null;
  let clienteId = profissional.asaasCustomerId;
  let erro: string | null = null;
  try {
    remota = await gateway.buscarPorReferencia(referencia);
    if (!remota) {
      if (!clienteId) {
        ({ id: clienteId } = await gateway.criarCliente({
          nome: profissional.nome,
          cpfCnpj: profissional.documento!,
          email: profissional.email,
          telefone: profissional.telefone,
          referencia: `profissional:${profissional.id}`,
        }));
      }
      remota = await gateway.criarCobranca({
        cliente: clienteId,
        forma: cobranca.forma,
        valorCentavos: cobranca.valorCentavos,
        vencimento: cobranca.vencimento,
        descricao: cobranca.descricao,
        referencia,
        multaBp: config.multaBp,
        jurosMesBp: config.jurosMesBp,
      });
    }
  } catch (e) {
    if (!(e instanceof ErroGateway)) throw e;
    erro = e.message;
  }
  // O "copia e cola" é um extra: sem ele, o link de pagamento continua valendo.
  let pix: string | null = null;
  if (remota && cobranca.forma === "PIX") {
    try {
      pix = (await gateway.obterPix(remota.id))?.copiaECola ?? null;
    } catch (e) {
      if (!(e instanceof ErroGateway)) throw e;
    }
  }

  return withSistema(
    tenantId,
    async (tx) => {
      if (clienteId && clienteId !== profissional.asaasCustomerId) {
        await tx.update(profissionais).set({ asaasCustomerId: clienteId }).where(eq(profissionais.id, profissional.id));
      }
      const [atualizada] = await tx
        .update(cobrancasProfissional)
        .set(
          remota
            ? {
                asaasPaymentId: remota.id,
                invoiceUrl: remota.invoiceUrl,
                bankSlipUrl: remota.bankSlipUrl,
                pixCopiaECola: pix,
                status: mapearStatusAsaas(remota.status, remota.removida),
                ultimoErro: null,
              }
            : { status: "erro", ultimoErro: erro },
        )
        .where(eq(cobrancasProfissional.id, cobrancaId))
        .returning();
      return atualizada;
    },
    database,
  );
}

/** Grava a cobrança (ainda sem enviar ao gateway), validando a configuração e o profissional. */
async function registrarCobranca(tx: Transaction, d: z.output<typeof novaCobrancaSchema>, agora: Date): Promise<{ id: string }> {
  const [config] = await tx.select().from(configuracoesCobranca);
  if (!config?.ativo) throw new ErroNegocio("A cobrança via Asaas não está ativada (Financeiro → Cobrança automática)");
  const [p] = await tx.select().from(profissionais).where(eq(profissionais.id, d.profissionalId));
  if (!p) throw new ErroNegocio("Profissional não encontrado");
  if (!p.documento) throw new ErroNegocio(`Cadastre o CPF ou CNPJ de ${p.nome} para emitir a cobrança`);
  const hoje = await hojeDoEspaco(tx, agora);
  const vencimento = d.vencimento ?? vencimentoPadrao(hoje, config.diasVencimento);
  if (vencimento < hoje) throw new ErroNegocio("O vencimento não pode estar no passado");
  const [c] = await tx
    .insert(cobrancasProfissional)
    .values({
      profissionalId: p.id,
      competencia: d.competencia ?? null,
      descricao: d.descricao || `Locação de salas${d.competencia ? ` — ${d.competencia.slice(5, 7)}/${d.competencia.slice(0, 4)}` : ""}`,
      valorCentavos: d.valorCentavos,
      vencimento,
      forma: d.forma,
      ambiente: config.ambiente,
    })
    .returning({ id: cobrancasProfissional.id });
  await registrarAuditoria(tx, {
    acao: "cobranca.criada",
    entidade: "cobrancas_profissional",
    entidadeId: c.id,
    dados: { profissionalId: p.id, valor: d.valorCentavos, vencimento, forma: d.forma },
  });
  return c;
}

/** Cobra o profissional via PIX/boleto. O pagamento confirmado vira baixa automática no ledger. */
export async function criarCobrancaProfissional(ctx: ContextoTenant, dados: z.input<typeof novaCobrancaSchema>, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "cobrancas.gerenciar");
  const d = novaCobrancaSchema.parse(dados);
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const { id } = await withTenant(ctx, (tx) => registrarCobranca(tx, d, agora), database);
  return enviarAoGateway(ctx.tenantId, id, opcoes.fabrica ?? gatewayDoTenant, database);
}

/** Saldo devedor do profissional hoje (todas as competências): positivo = deve ao espaço. */
async function saldoAtual(tx: Transaction, profissionalId: string): Promise<number> {
  const [{ saldo }] = await tx
    .select({
      saldo: sql<string>`coalesce(sum(case when ${lancamentos.natureza} = 'debito' then ${lancamentos.valorCentavos} else -${lancamentos.valorCentavos} end), 0)`,
    })
    .from(lancamentos)
    .where(eq(lancamentos.profissionalId, profissionalId));
  return Number(saldo);
}

/**
 * Autoatendimento: o profissional gera o PIX do que deve hoje. Se já houver uma cobrança em
 * aberto, devolve essa (não duplica); a equipe cancela e gera outra se o valor mudou.
 */
export async function pagarMeuSaldoComPix(ctx: ContextoTenant, opcoes: Opcoes = {}): Promise<{ cobranca: LinhaCobranca; nova: boolean }> {
  exigirPermissao(ctx.role, "extrato.proprio");
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const preparo = await withTenant(
    ctx,
    async (tx) => {
      const proprio = await profissionalDoUsuario(tx, ctx.userId);
      if (!proprio) throw new ErroNegocio("Seu usuário não está vinculado a um cadastro de profissional");
      const [aberta] = await tx
        .select()
        .from(cobrancasProfissional)
        .where(and(eq(cobrancasProfissional.profissionalId, proprio.id), inArray(cobrancasProfissional.status, ["pendente", "vencida"])))
        .orderBy(desc(cobrancasProfissional.criadoEm))
        .limit(1);
      if (aberta) return { aberta, id: null };
      const [config] = await tx.select({ ativo: configuracoesCobranca.ativo }).from(configuracoesCobranca);
      if (!config?.ativo) throw new ErroNegocio("O espaço ainda não ativou o pagamento online. Fale com a recepção.");
      const [p] = await tx.select({ documento: profissionais.documento }).from(profissionais).where(eq(profissionais.id, proprio.id));
      if (!p.documento) throw new ErroNegocio("Para gerar o PIX, peça à recepção para cadastrar seu CPF ou CNPJ");
      const saldo = await saldoAtual(tx, proprio.id);
      if (saldo <= 0) throw new ErroNegocio("Você não tem valores a pagar");
      const dados = novaCobrancaSchema.parse({ profissionalId: proprio.id, valorCentavos: saldo, forma: "PIX", descricao: "Locação de salas: saldo em aberto" });
      const { id } = await registrarCobranca(tx, dados, agora);
      await registrarAuditoria(tx, { acao: "cobranca.autoatendimento", entidade: "cobrancas_profissional", entidadeId: id });
      return { aberta: null, id };
    },
    database,
  );
  if (preparo.aberta) return { cobranca: preparo.aberta, nova: false };
  const cobranca = await enviarAoGateway(ctx.tenantId, preparo.id, opcoes.fabrica ?? gatewayDoTenant, database);
  return { cobranca, nova: true };
}

/** Reenvia uma cobrança com erro (consulta a referência antes; não duplica). */
export async function reenviarCobranca(ctx: ContextoTenant, cobrancaId: string, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "cobrancas.gerenciar");
  const database = opcoes.database ?? getDb();
  const [c] = await withTenant(ctx, (tx) => tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, cobrancaId)), database);
  if (!c || c.status !== "erro") throw new ErroNegocio("Só cobranças com erro podem ser reenviadas");
  return enviarAoGateway(ctx.tenantId, cobrancaId, opcoes.fabrica ?? gatewayDoTenant, database);
}

export async function cancelarCobranca(ctx: ContextoTenant, cobrancaId: string, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "cobrancas.gerenciar");
  const database = opcoes.database ?? getDb();
  const { c, config } = await withTenant(
    ctx,
    async (tx) => ({
      c: (await tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, cobrancaId)))[0],
      config: (await tx.select().from(configuracoesCobranca))[0],
    }),
    database,
  );
  if (!c || !["pendente", "vencida", "erro"].includes(c.status)) throw new ErroNegocio("Só cobranças em aberto podem ser canceladas");
  if (c.asaasPaymentId) {
    try {
      await (opcoes.fabrica ?? gatewayDoTenant)({ ...config, ambiente: c.ambiente }).cancelarCobranca(c.asaasPaymentId);
    } catch (e) {
      if (e instanceof ErroGateway) throw new ErroNegocio(e.message);
      throw e;
    }
  }
  await withTenant(
    ctx,
    async (tx) => {
      await tx.update(cobrancasProfissional).set({ status: "cancelada" }).where(eq(cobrancasProfissional.id, cobrancaId));
      await registrarAuditoria(tx, { acao: "cobranca.cancelada", entidade: "cobrancas_profissional", entidadeId: cobrancaId });
    },
    database,
  );
}

/**
 * Aplica o status oficial do gateway: paga → baixa automática (pagamento + lançamento),
 * estornada depois de paga → estorno no ledger. Idempotente.
 */
async function aplicarSituacao(tx: Transaction, cobranca: LinhaCobranca, status: StatusCobranca, billingType: string | null, agora: Date) {
  if (cobranca.status === status) return false;
  // Estados finais não regridem (ex.: webhook atrasado de "pendente" depois do pagamento).
  if (cobranca.status === "cancelada" || cobranca.status === "estornada") return false;
  if (cobranca.status === "paga" && status !== "estornada") return false;

  const hoje = await hojeDoEspaco(tx, agora);
  const mudancas: Partial<LinhaCobranca> = { status };

  if (status === "paga" && !cobranca.pagamentoId) {
    const pagamento = await inserirPagamento(tx, {
      profissionalId: cobranca.profissionalId,
      data: hoje,
      valorCentavos: cobranca.valorCentavos,
      direcao: "profissional_para_espaco",
      forma: formaDaBaixa(billingType),
      observacao: `Asaas ${cobranca.asaasPaymentId ?? ""}`.trim(),
    });
    mudancas.pagamentoId = pagamento.id;
    mudancas.pagoEm = agora;
  }
  if (status === "estornada" && cobranca.pagamentoId) {
    await estornarPagamento(tx, cobranca.pagamentoId, "estorno no Asaas", hoje);
  }
  await tx.update(cobrancasProfissional).set(mudancas).where(eq(cobrancasProfissional.id, cobranca.id));
  await registrarAuditoria(tx, {
    acao: `cobranca.${status}`,
    entidade: "cobrancas_profissional",
    entidadeId: cobranca.id,
    dados: { de: cobranca.status, para: status, valor: formatarMoeda(cobranca.valorCentavos) },
  });
  return true;
}

/** Ambiente simulado: marca a cobrança como paga (equivale ao webhook PAYMENT_RECEIVED). */
export async function simularPagamento(ctx: ContextoTenant, cobrancaId: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "cobrancas.gerenciar");
  await withTenant(
    ctx,
    async (tx) => {
      const [c] = await tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, cobrancaId)).for("update");
      if (!c) throw new ErroNegocio("Cobrança não encontrada");
      if (c.ambiente !== "simulado") throw new ErroNegocio("Só cobranças do ambiente simulado podem ser pagas por aqui");
      await aplicarSituacao(tx, c, "paga", "PIX", agora);
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Webhook e sincronização
// ---------------------------------------------------------------------------

export type PayloadWebhookAsaas = { id?: string; event?: string; payment?: { id?: string; externalReference?: string | null } };

function tokenConfere(recebido: string | null, hashEsperado: string | null): boolean {
  if (!recebido || !hashEsperado) return false;
  const a = Buffer.from(hashToken(recebido));
  const b = Buffer.from(hashEsperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook da conta Asaas do espaço. Valida o token, registra o evento (idempotência)
 * e aplica o status consultado na API — o payload só indica qual cobrança olhar.
 */
export async function processarWebhookTenant(
  tenantId: string,
  token: string | null,
  payload: PayloadWebhookAsaas,
  opcoes: Opcoes = {},
): Promise<"ok" | "duplicado" | "ignorado" | "nao_autorizado"> {
  const database = opcoes.database ?? getDb();
  if (!z.uuid().safeParse(tenantId).success) return "nao_autorizado";
  const agora = opcoes.agora ?? new Date();
  const contexto = await withSistema(
    tenantId,
    async (tx) => {
      const [config] = await tx.select().from(configuracoesCobranca);
      if (!config || !tokenConfere(token, config.webhookTokenHash)) return null;
      if (!payload.id || !payload.payment?.id) return { config, cobranca: null, duplicado: false };
      const inseridos = await tx
        .insert(eventosWebhook)
        .values({ origem: "asaas_tenant", eventoId: payload.id, tipo: payload.event ?? "desconhecido", payload: payload as Record<string, unknown> })
        .onConflictDoNothing()
        .returning({ id: eventosWebhook.id });
      const [cobranca] = await tx
        .select()
        .from(cobrancasProfissional)
        .where(eq(cobrancasProfissional.asaasPaymentId, payload.payment.id));
      return { config, cobranca: cobranca ?? null, duplicado: inseridos.length === 0 };
    },
    database,
  );
  if (!contexto) return "nao_autorizado";
  if (contexto.duplicado) return "duplicado";
  if (!contexto.cobranca) return "ignorado";
  await sincronizarUma(tenantId, contexto.cobranca, contexto.config, opcoes.fabrica ?? gatewayDoTenant, agora, database);
  return "ok";
}

async function sincronizarUma(
  tenantId: string,
  cobranca: LinhaCobranca,
  config: LinhaConfig,
  fabrica: FabricaGateway,
  agora: Date,
  database: Database,
): Promise<boolean> {
  if (!cobranca.asaasPaymentId || cobranca.ambiente === "simulado") return false;
  const remota = await fabrica({ ...config, ambiente: cobranca.ambiente }).consultarCobranca(cobranca.asaasPaymentId);
  if (!remota) return false;
  return withSistema(
    tenantId,
    async (tx) => {
      const [atual] = await tx.select().from(cobrancasProfissional).where(eq(cobrancasProfissional.id, cobranca.id)).for("update");
      return aplicarSituacao(tx, atual, mapearStatusAsaas(remota.status, remota.removida), remota.billingType, agora);
    },
    database,
  );
}

/** Job de reserva do webhook: consulta as cobranças em aberto (e pagas, para captar estornos recentes). */
export async function sincronizarCobrancas(tenantId: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const { config, abertas } = await withSistema(
    tenantId,
    async (tx) => ({
      config: (await tx.select().from(configuracoesCobranca))[0] ?? null,
      abertas: await tx
        .select()
        .from(cobrancasProfissional)
        .where(
          and(
            inArray(cobrancasProfissional.status, ["pendente", "vencida"]),
            isNotNull(cobrancasProfissional.asaasPaymentId),
            ne(cobrancasProfissional.ambiente, "simulado"),
          ),
        )
        .limit(50),
    }),
    database,
  );
  if (!config) return { atualizadas: 0 };
  let atualizadas = 0;
  for (const c of abertas) {
    try {
      if (await sincronizarUma(tenantId, c, config, opcoes.fabrica ?? gatewayDoTenant, agora, database)) atualizadas++;
    } catch (e) {
      if (!(e instanceof ErroGateway)) throw e;
    }
  }
  return { atualizadas };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listarCobrancas(ctx: ContextoTenant, profissionalId?: string, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      let alvo = profissionalId;
      if (!pode(ctx.role, "cobrancas.gerenciar")) {
        exigirPermissao(ctx.role, "extrato.proprio");
        alvo = (await profissionalDoUsuario(tx, ctx.userId))?.id ?? "00000000-0000-0000-0000-000000000000";
      }
      return tx
        .select()
        .from(cobrancasProfissional)
        .where(alvo ? eq(cobrancasProfissional.profissionalId, alvo) : undefined)
        .orderBy(desc(cobrancasProfissional.criadoEm))
        .limit(30);
    },
    database,
  );
}

/** O espaço aceita pagamento online (Asaas ativo)? Sem expor a configuração. */
export async function pagamentoOnlineAtivo(ctx: ContextoTenant, database?: Database): Promise<boolean> {
  return withTenant(
    ctx,
    async (tx) => Boolean((await tx.select({ ativo: configuracoesCobranca.ativo }).from(configuracoesCobranca))[0]?.ativo),
    database,
  );
}
