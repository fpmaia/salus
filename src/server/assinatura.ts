import { timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { eventosWebhook, faturasSaas, planosSaas, profissionais, salas, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { excedeLimite, mapearStatusAsaas, usoAcimaDosLimites, vencimentoDaFaturaSaas, type RecursoLimitado } from "../domain/cobranca";
import { competenciaDe } from "../domain/financeiro";
import { exigirPermissao } from "../domain/rbac";
import { somarDias } from "../domain/tempo";
import { ErroGateway, gatewayDaPlataforma, type GatewayCobranca } from "./asaas";
import { ErroNegocio } from "./erros";
import { hojeDoEspaco } from "./fuso";

// Cobrança do SaaS (Salus → espaço) na conta Asaas da PLATAFORMA (variáveis ASAAS_*),
// e limites de uso por plano.

type Opcoes = { agora?: Date; gateway?: GatewayCobranca; database?: Database };

// ---------------------------------------------------------------------------
// Limites do plano
// ---------------------------------------------------------------------------

async function usoAtual(tx: Transaction): Promise<Record<RecursoLimitado, number>> {
  // Em sequência: uma transação usa um único client do pg (Promise.all aqui enfileira e o pg@9 recusa).
  const [u] = await tx.select({ total: count() }).from(unidades).where(eq(unidades.ativo, true));
  const [s] = await tx.select({ total: count() }).from(salas).where(eq(salas.ativo, true));
  const [p] = await tx.select({ total: count() }).from(profissionais).where(eq(profissionais.ativo, true));
  return { unidades: u.total, salas: s.total, profissionais: p.total };
}

async function planoDoTenant(tx: Transaction) {
  const [linha] = await tx
    .select({ plano: planosSaas })
    .from(tenants)
    .innerJoin(planosSaas, eq(planosSaas.id, tenants.planoId));
  return linha?.plano ?? null;
}

/** Bloqueia criar/reativar um recurso além do limite do plano (chamado na mesma transação). */
export async function exigirLimite(tx: Transaction, recurso: RecursoLimitado): Promise<void> {
  const plano = await planoDoTenant(tx);
  if (!plano) return;
  const motivo = excedeLimite(plano.limites, recurso, (await usoAtual(tx))[recurso], plano.nome);
  if (motivo) throw new ErroNegocio(motivo);
}

// ---------------------------------------------------------------------------
// Assinatura (tela do admin)
// ---------------------------------------------------------------------------

export async function obterAssinatura(ctx: ContextoTenant, database?: Database) {
  exigirPermissao(ctx.role, "assinatura.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const plano = await planoDoTenant(tx);
      const uso = await usoAtual(tx);
      const planos = await tx.select().from(planosSaas).where(eq(planosSaas.ativo, true)).orderBy(asc(planosSaas.precoMensalCentavos));
      const faturas = await tx.select().from(faturasSaas).orderBy(desc(faturasSaas.competencia)).limit(12);
      return { plano, uso, planos, faturas, emAtraso: faturas.some((f) => f.status === "vencida") };
    },
    database,
  );
}

/** Fatura do SaaS vencida? (aviso no layout do painel). */
export async function assinaturaEmAtraso(ctx: ContextoTenant, database?: Database): Promise<boolean> {
  return withTenant(
    ctx,
    async (tx) => (await tx.select({ id: faturasSaas.id }).from(faturasSaas).where(eq(faturasSaas.status, "vencida")).limit(1)).length > 0,
    database,
  );
}

/** Troca de plano: vale a partir da próxima fatura. Downgrade só se o uso couber no novo plano. */
export async function trocarPlano(ctx: ContextoTenant, codigo: string, database?: Database) {
  exigirPermissao(ctx.role, "tenant.configurar");
  await withTenant(
    ctx,
    async (tx) => {
      const [novo] = await tx.select().from(planosSaas).where(and(eq(planosSaas.codigo, codigo), eq(planosSaas.ativo, true)));
      if (!novo) throw new ErroNegocio("Plano não encontrado");
      const excedidos = usoAcimaDosLimites(novo.limites, await usoAtual(tx));
      if (excedidos.length > 0) {
        throw new ErroNegocio(`O uso atual não cabe no plano ${novo.nome}: reduza ${excedidos.join(", ")} antes de trocar`);
      }
      const atual = await planoDoTenant(tx);
      await tx.update(tenants).set({ planoId: novo.id });
      await registrarAuditoria(tx, { acao: "assinatura.plano", entidade: "tenants", dados: { de: atual?.codigo, para: novo.codigo } });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Faturas (job do worker, um tenant por vez)
// ---------------------------------------------------------------------------

/** Gera e envia a fatura do mês corrente (idempotente: uma por competência). */
export async function gerarFaturaDoMes(tenantId: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();

  const preparo = await withSistema(
    tenantId,
    async (tx) => {
      const [tenant] = await tx.select().from(tenants);
      if (!tenant || tenant.status !== "ativo") return null;
          const hoje = await hojeDoEspaco(tx, agora);
      const competencia = competenciaDe(hoje);
      // Fatura gerada depois do dia 10 (ex.: primeiro mês) vence em 3 dias, nunca no passado.
      const vencimentoBase = vencimentoDaFaturaSaas(competencia);
      const minimo = somarDias(hoje, 3);
      const plano = await planoDoTenant(tx);
      if (!plano || plano.precoMensalCentavos <= 0) return null;
      const [fatura] = await tx
        .insert(faturasSaas)
        .values({
          competencia,
          planoId: plano.id,
          valorCentavos: plano.precoMensalCentavos,
          vencimento: vencimentoBase < minimo ? minimo : vencimentoBase,
          ambiente: gateway.ambiente,
        })
        .onConflictDoNothing()
        .returning();
      if (!fatura) return null; // já existe a do mês
      return { tenant, plano, fatura };
    },
    database,
  );
  if (!preparo) return { criada: false };
  return { criada: true, ...(await enviarFatura(tenantId, preparo.fatura.id, gateway, database)) };
}

/** Envia a fatura ao Asaas da plataforma (consultando a referência antes; não duplica). */
async function enviarFatura(tenantId: string, faturaId: string, gateway: GatewayCobranca, database: Database) {
  const { tenant, fatura, plano } = await withSistema(
    tenantId,
    async (tx) => {
      const [t] = await tx.select().from(tenants);
      const [f] = await tx.select().from(faturasSaas).where(eq(faturasSaas.id, faturaId));
      const [p] = await tx.select().from(planosSaas).where(eq(planosSaas.id, f.planoId));
      return { tenant: t, fatura: f, plano: p };
    },
    database,
  );
  const referencia = `saas:${tenantId}:${faturaId}`;
  let clienteId = tenant.asaasCustomerId;
  try {
    let remota = await gateway.buscarPorReferencia(referencia);
    if (!remota) {
      clienteId ??= (await gateway.criarCliente({ nome: tenant.nome, cpfCnpj: tenant.documento, referencia: `tenant:${tenantId}` })).id;
      remota = await gateway.criarCobranca({
        cliente: clienteId,
        forma: "UNDEFINED",
        valorCentavos: fatura.valorCentavos,
        vencimento: fatura.vencimento,
        descricao: `Salus — plano ${plano.nome} — ${fatura.competencia.slice(5, 7)}/${fatura.competencia.slice(0, 4)}`,
        referencia,
      });
    }
    await withSistema(
      tenantId,
      async (tx) => {
        if (clienteId !== tenant.asaasCustomerId) await tx.update(tenants).set({ asaasCustomerId: clienteId });
        await tx
          .update(faturasSaas)
          .set({ asaasPaymentId: remota.id, invoiceUrl: remota.invoiceUrl, status: mapearStatusAsaas(remota.status, remota.removida), ultimoErro: null })
          .where(eq(faturasSaas.id, faturaId));
      },
      database,
    );
    return { enviada: true };
  } catch (erro) {
    if (!(erro instanceof ErroGateway)) throw erro;
    await withSistema(
      tenantId,
      (tx) => tx.update(faturasSaas).set({ status: "erro", ultimoErro: erro.message }).where(eq(faturasSaas.id, faturaId)),
      database,
    );
    return { enviada: false, erro: erro.message };
  }
}

async function aplicarStatusFatura(tx: Transaction, faturaId: string, status: ReturnType<typeof mapearStatusAsaas>, agora: Date) {
  const [atual] = await tx.select().from(faturasSaas).where(eq(faturasSaas.id, faturaId)).for("update");
  if (!atual || atual.status === status || atual.status === "cancelada") return false;
  if (atual.status === "paga" && status !== "estornada") return false;
  await tx
    .update(faturasSaas)
    .set({ status, ...(status === "paga" ? { pagoEm: agora } : {}) })
    .where(eq(faturasSaas.id, faturaId));
  await registrarAuditoria(tx, { acao: `assinatura.fatura_${status}`, entidade: "faturas_saas", entidadeId: faturaId });
  return true;
}

/** Job: reenvia faturas com erro e consulta as em aberto (reserva do webhook). */
export async function sincronizarFaturas(tenantId: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  const abertas = await withSistema(
    tenantId,
    (tx) => tx.select().from(faturasSaas).where(inArray(faturasSaas.status, ["pendente", "vencida", "erro"])).limit(12),
    database,
  );
  let atualizadas = 0;
  for (const f of abertas) {
    if (f.status === "erro") {
      if ((await enviarFatura(tenantId, f.id, gateway, database)).enviada) atualizadas++;
      continue;
    }
    if (!f.asaasPaymentId || f.ambiente === "simulado") continue;
    try {
      const remota = await gateway.consultarCobranca(f.asaasPaymentId);
      if (!remota) continue;
      const mudou = await withSistema(tenantId, (tx) => aplicarStatusFatura(tx, f.id, mapearStatusAsaas(remota.status, remota.removida), agora), database);
      if (mudou) atualizadas++;
    } catch (e) {
      if (!(e instanceof ErroGateway)) throw e;
    }
  }
  return { atualizadas };
}

/** Ambiente simulado: o admin "paga" a própria fatura (desenvolvimento/demonstração). */
export async function simularPagamentoFatura(ctx: ContextoTenant, faturaId: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "assinatura.ver");
  await withTenant(
    ctx,
    async (tx) => {
      const [f] = await tx.select().from(faturasSaas).where(eq(faturasSaas.id, faturaId));
      if (!f) throw new ErroNegocio("Fatura não encontrada");
      if (f.ambiente !== "simulado") throw new ErroNegocio("Só faturas do ambiente simulado podem ser pagas por aqui");
      await aplicarStatusFatura(tx, faturaId, "paga", agora);
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Webhook da conta da plataforma
// ---------------------------------------------------------------------------

function tokenDaPlataformaConfere(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook do Asaas da plataforma. A referência externa ("saas:<tenant>:<fatura>") diz o
 * tenant; o status vem da consulta à API (o payload só indica qual cobrança olhar).
 */
export async function processarWebhookPlataforma(
  token: string | null,
  payload: { id?: string; event?: string; payment?: { id?: string; externalReference?: string | null } },
  opcoes: Opcoes = {},
): Promise<"ok" | "duplicado" | "ignorado" | "nao_autorizado"> {
  if (!tokenDaPlataformaConfere(token)) return "nao_autorizado";
  const database = opcoes.database ?? getDb();
  const agora = opcoes.agora ?? new Date();
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  const partes = payload.payment?.externalReference?.split(":") ?? [];
  if (partes[0] !== "saas" || !payload.id || !payload.payment?.id) return "ignorado";
  const [, tenantId, faturaId] = partes;
  if (!z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(faturaId).success) return "ignorado";

  const registro = await withSistema(
    tenantId,
    async (tx) => {
      const [fatura] = await tx
        .select()
        .from(faturasSaas)
        .where(and(eq(faturasSaas.id, faturaId), isNotNull(faturasSaas.asaasPaymentId), eq(faturasSaas.asaasPaymentId, payload.payment!.id!)));
      if (!fatura) return null;
      const inseridos = await tx
        .insert(eventosWebhook)
        .values({ origem: "asaas_plataforma", eventoId: payload.id!, tipo: payload.event ?? "desconhecido", payload: payload as Record<string, unknown> })
        .onConflictDoNothing()
        .returning({ id: eventosWebhook.id });
      return { fatura, duplicado: inseridos.length === 0 };
    },
    database,
  );
  if (!registro) return "ignorado";
  if (registro.duplicado) return "duplicado";
  const remota = await gateway.consultarCobranca(registro.fatura.asaasPaymentId!);
  if (!remota) return "ignorado";
  await withSistema(tenantId, (tx) => aplicarStatusFatura(tx, faturaId, mapearStatusAsaas(remota.status, remota.removida), agora), database);
  return "ok";
}

