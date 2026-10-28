import { timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { eventosWebhook, faturasSaas, faturasSaasItens, licencasProntuario, memberships, planosSaas, profissionais, salas, tenants, unidades, users } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import {
  calcularItensFaturaSaas,
  DIAS_DE_TRIAL_PRONTUARIO,
  estadoLicencaProntuario,
  estenderPagamentoProntuario,
  excedeLimite,
  licencaFaturavelNoEspaco,
  licencaPermiteEscrita,
  mapearStatusAsaas,
  situacaoDaAssinatura,
  usoAcimaDosLimites,
  vencimentoDaFaturaSaas,
  type RecursoLimitado,
  type SituacaoAssinatura,
} from "../domain/cobranca";
import { competenciaDe } from "../domain/financeiro";
import { exigirPermissao } from "../domain/rbac";
import { hojeNoFuso, somarDias } from "../domain/tempo";
import { ErroGateway, gatewayDaPlataforma, type GatewayCobranca } from "./asaas";
import { emailDoAmbiente, type ProvedorEmail } from "./email";
import { emailAssinaturaEmAtraso } from "./email-modelos";
import { ErroNegocio } from "./erros";
import { hojeDoEspaco } from "./fuso";
import { urlPublica } from "./links";
import { profissionalDoUsuario } from "./profissionais";
import { formatarDataBr } from "./reservas";

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

/** Preço da licença do prontuário no plano do espaço (para os textos das telas). */
export async function precoProntuarioDoPlano(ctx: ContextoTenant, database?: Database): Promise<number> {
  return withTenant(ctx, async (tx) => (await planoDoTenant(tx))?.precoProntuarioCentavos ?? 4990, database);
}

/** Bloqueia criar/reativar um recurso além do limite do plano (chamado na mesma transação). */
export async function exigirLimite(tx: Transaction, recurso: RecursoLimitado): Promise<void> {
  const plano = await planoDoTenant(tx);
  if (!plano) return;
  const motivo = excedeLimite(
    plano.limites,
    recurso,
    (await usoAtual(tx))[recurso],
    plano.nome,
    plano.permiteUnidadeExtra,
  );
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

      const faturasIds = faturas.map((f) => f.id);
      const itensFaturas = faturasIds.length > 0
        ? await tx.select().from(faturasSaasItens).where(inArray(faturasSaasItens.faturaId, faturasIds))
        : [];

      const itensPorFatura = itensFaturas.reduce((acc, item) => {
        acc[item.faturaId] = acc[item.faturaId] || [];
        acc[item.faturaId].push(item);
        return acc;
      }, {} as Record<string, typeof itensFaturas>);

      const todosProfissionais = await tx
        .select({
          id: profissionais.id,
          nome: profissionais.nome,
        })
        .from(profissionais)
        .where(eq(profissionais.ativo, true))
        .orderBy(asc(profissionais.nome));

      const licencas = await tx
        .select({
          id: licencasProntuario.id,
          profissionalId: licencasProntuario.profissionalId,
          ativo: licencasProntuario.ativo,
          trialInicioEm: licencasProntuario.trialInicioEm,
          trialFimEm: licencasProntuario.trialFimEm,
          responsavel: licencasProntuario.responsavel,
          pagoAte: licencasProntuario.pagoAte,
        })
        .from(licencasProntuario);

      const mapaLicencas = new Map(licencas.map((l) => [l.profissionalId, l]));
      const agora = new Date();

      const profissionaisProntuario = todosProfissionais.map((p) => {
        const lic = mapaLicencas.get(p.id);
        const estado = estadoLicencaProntuario(lic, agora);
        return {
          id: p.id,
          nome: p.nome,
          licencaId: lic?.id ?? null,
          ativo: lic?.ativo ?? false,
          estado,
          emTrial: estado === "teste",
          trialFimEm: lic?.trialFimEm ?? null,
          responsavel: lic?.responsavel ?? null,
          faturavel: lic ? licencaFaturavelNoEspaco(lic, agora) : false,
        };
      });

      const prontuariosFaturaveis = profissionaisProntuario.filter((l) => l.faturavel).length;
      const prontuariosEmTrial = profissionaisProntuario.filter((l) => l.emTrial).length;

      const projecaoProximoMes = plano
        ? calcularItensFaturaSaas({
            planoNome: plano.nome,
            precoBaseCentavos: plano.precoMensalCentavos,
            limites: plano.limites,
            precoSalaExtraCentavos: plano.precoSalaExtraCentavos,
            precoProfissionalExtraCentavos: plano.precoProfissionalExtraCentavos,
            precoUnidadeExtraCentavos: plano.precoUnidadeExtraCentavos,
            precoProntuarioCentavos: plano.precoProntuarioCentavos,
            unidadesAtivas: uso.unidades,
            salasAtivas: uso.salas,
            profissionaisAtivos: uso.profissionais,
            profissionaisProntuarioFaturaveis: prontuariosFaturaveis,
          })
        : null;

      return {
        plano,
        uso,
        planos,
        faturas,
        itensFaturas,
        itensPorFatura,
        licencas,
        profissionaisProntuario,
        prontuariosEmTrial,
        prontuariosFaturaveis,
        projecaoProximoMes,
        situacao: await situacaoNaTransacao(tx),
      };
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Inadimplência: carência, aviso e suspensão (regra em src/domain/cobranca.ts)
// ---------------------------------------------------------------------------

export const MENSAGEM_SUSPENSO =
  "Este espaço está só para consulta porque a fatura do Salus está em atraso. Assim que ela for paga, tudo volta a funcionar.";

async function situacaoNaTransacao(tx: Transaction, agora = new Date()): Promise<SituacaoAssinatura> {
  const abertas = await tx
    .select({ status: faturasSaas.status, vencimento: faturasSaas.vencimento })
    .from(faturasSaas)
    .where(inArray(faturasSaas.status, ["pendente", "vencida"]));
  return situacaoDaAssinatura(abertas, await hojeDoEspaco(tx, agora));
}

/** Situação da assinatura do espaço (aviso no painel e bloqueio das ações). Qualquer papel. */
export async function situacaoDaAssinaturaDoEspaco(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  return withTenant(ctx, (tx) => situacaoNaTransacao(tx, agora), database);
}

/** Para quem não tem sessão (agendamento online): o espaço está suspenso por atraso? */
export async function espacoSuspensoPorAtraso(tenantId: string, agora = new Date(), database?: Database): Promise<boolean> {
  return (await withSistema(tenantId, (tx) => situacaoNaTransacao(tx, agora), database)).estado === "suspensa";
}

/** Suspenso, o espaço só consulta: as mutações recusam (exceto pagar e trocar de plano). */
export async function exigirAssinaturaEmDia(ctx: ContextoTenant, agora = new Date(), database?: Database): Promise<void> {
  if ((await situacaoDaAssinaturaDoEspaco(ctx, agora, database)).estado === "suspensa") throw new ErroNegocio(MENSAGEM_SUSPENSO);
}

/**
 * Job diário: e-mail aos admins 5 dias antes da suspensão e no dia em que ela começa (um de
 * cada por fatura). A suspensão em si não depende do job: é calculada a cada acesso.
 */
export async function avisarAtrasoDaAssinatura(
  tenantId: string,
  opcoes: { agora?: Date; provedor?: ProvedorEmail; database?: Database } = {},
): Promise<{ aviso: "nenhum" | "suspensao_proxima" | "suspensa"; emails: number }> {
  const agora = opcoes.agora ?? new Date();
  const database = opcoes.database ?? getDb();
  const preparo = await withSistema(
    tenantId,
    async (tx) => {
      const situacao = await situacaoNaTransacao(tx, agora);
      if (situacao.estado === "em_dia") return null;
      const suspensa = situacao.estado === "suspensa";
      if (!suspensa && (await hojeDoEspaco(tx, agora)) < situacao.avisarEm) return null;
      const [fatura] = await tx
        .select()
        .from(faturasSaas)
        .where(and(inArray(faturasSaas.status, ["pendente", "vencida"]), eq(faturasSaas.vencimento, situacao.vencimento)))
        .orderBy(asc(faturasSaas.competencia))
        .limit(1);
      if (!fatura || (suspensa ? fatura.suspensaoAvisadaEm : fatura.avisoSuspensaoEm)) return null;
      const [tenant] = await tx.select({ nome: tenants.nome }).from(tenants);
      const admins = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.role, "admin"), eq(memberships.ativo, true)));
      return { situacao, suspensa, fatura, espaco: tenant?.nome ?? "", admins: admins.map((a) => a.email) };
    },
    database,
  );
  if (!preparo) return { aviso: "nenhum", emails: 0 };

  const { situacao, suspensa, fatura } = preparo;
  const provedor = opcoes.provedor ?? emailDoAmbiente();
  let emails = 0;
  for (const para of preparo.admins) {
    const mensagem = emailAssinaturaEmAtraso(para, {
      espaco: preparo.espaco,
      vencimento: formatarDataBr(situacao.vencimento),
      suspensaoEm: formatarDataBr(situacao.suspensaoEm),
      suspensa,
      url: `${urlPublica()}/painel/assinatura`,
    });
    if (await provedor.enviar(mensagem).then(() => true, () => false)) emails++;
  }
  // Nenhum e-mail saiu (provedor fora do ar): tenta de novo na próxima rodada.
  if (preparo.admins.length > 0 && emails === 0) return { aviso: "nenhum", emails: 0 };

  await withSistema(
    tenantId,
    async (tx) => {
      // Na suspensão, o aviso prévio também fica marcado (não faz sentido mandá-lo depois).
      await tx
        .update(faturasSaas)
        .set(suspensa ? { suspensaoAvisadaEm: agora, avisoSuspensaoEm: fatura.avisoSuspensaoEm ?? agora } : { avisoSuspensaoEm: agora })
        .where(eq(faturasSaas.id, fatura.id));
      await registrarAuditoria(tx, {
        acao: suspensa ? "assinatura.suspensa" : "assinatura.aviso_suspensao",
        entidade: "faturas_saas",
        entidadeId: fatura.id,
        dados: { vencimento: situacao.vencimento, suspensaoEm: situacao.suspensaoEm },
      });
    },
    database,
  );
  return { aviso: suspensa ? "suspensa" : "suspensao_proxima", emails };
}

/**
 * Troca de plano: os limites mudam na hora e a próxima fatura gerada usa o novo plano (a do mês já
 * gerada não muda). Downgrade só bloqueia por unidade a mais num plano sem unidade extra; salas e
 * profissionais acima do limite viram excedente na fatura.
 */
export async function trocarPlano(ctx: ContextoTenant, codigo: string, database?: Database) {
  exigirPermissao(ctx.role, "tenant.configurar");
  await withTenant(
    ctx,
    async (tx) => {
      const [novo] = await tx.select().from(planosSaas).where(and(eq(planosSaas.codigo, codigo), eq(planosSaas.ativo, true)));
      if (!novo) throw new ErroNegocio("Plano não encontrado");
      const excedidos = usoAcimaDosLimites(novo.limites, await usoAtual(tx), novo.permiteUnidadeExtra);
      if (excedidos.length > 0) {
        throw new ErroNegocio(`O plano ${novo.nome} permite apenas ${novo.limites.unidades} unidade: desative as unidades a mais antes de trocar`);
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

      const uso = await usoAtual(tx);
      // Só as licenças pagas pelo espaço; as do profissional têm cobrança própria.
      const licencas = await tx.select().from(licencasProntuario).where(eq(licencasProntuario.ativo, true));
      const prontuariosFaturaveis = licencas.filter((l) => licencaFaturavelNoEspaco(l, agora)).length;

      const calculo = calcularItensFaturaSaas({
        planoNome: plano.nome,
        precoBaseCentavos: plano.precoMensalCentavos,
        limites: plano.limites,
        precoSalaExtraCentavos: plano.precoSalaExtraCentavos,
        precoProfissionalExtraCentavos: plano.precoProfissionalExtraCentavos,
        precoUnidadeExtraCentavos: plano.precoUnidadeExtraCentavos,
        precoProntuarioCentavos: plano.precoProntuarioCentavos,
        unidadesAtivas: uso.unidades,
        salasAtivas: uso.salas,
        profissionaisAtivos: uso.profissionais,
        profissionaisProntuarioFaturaveis: prontuariosFaturaveis,
      });

      const [fatura] = await tx
        .insert(faturasSaas)
        .values({
          competencia,
          planoId: plano.id,
          valorCentavos: calculo.valorTotalCentavos,
          vencimento: vencimentoBase < minimo ? minimo : vencimentoBase,
          ambiente: gateway.ambiente,
        })
        .onConflictDoNothing()
        .returning();

      if (!fatura) return null; // já existe a do mês

      for (const item of calculo.itens) {
        await tx.insert(faturasSaasItens).values({
          faturaId: fatura.id,
          tipo: item.tipo,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnitarioCentavos: item.valorUnitarioCentavos,
          valorTotalCentavos: item.valorTotalCentavos,
        });
      }

      return { tenant, plano, fatura, calculo };
    },
    database,
  );
  if (!preparo) return { criada: false };
  return { criada: true, ...(await enviarFatura(tenantId, preparo.fatura.id, gateway, database)) };
}

/** Envia a fatura ao Asaas da plataforma (consultando a referência antes; não duplica). */
async function enviarFatura(tenantId: string, faturaId: string, gateway: GatewayCobranca, database: Database) {
  const { tenant, fatura, plano, itens } = await withSistema(
    tenantId,
    async (tx) => {
      const [t] = await tx.select().from(tenants);
      const [f] = await tx.select().from(faturasSaas).where(eq(faturasSaas.id, faturaId));
      const [p] = await tx.select().from(planosSaas).where(eq(planosSaas.id, f.planoId));
      const its = await tx.select().from(faturasSaasItens).where(eq(faturasSaasItens.faturaId, faturaId));
      return { tenant: t, fatura: f, plano: p, itens: its };
    },
    database,
  );
  const referencia = `saas:${tenantId}:${faturaId}`;
  let clienteId = tenant.asaasCustomerId;
  try {
    let remota = await gateway.buscarPorReferencia(referencia);
    if (!remota) {
      clienteId ??= (await gateway.criarCliente({ nome: tenant.nome, cpfCnpj: tenant.documento, referencia: `tenant:${tenantId}` })).id;
      const descricao = itens.length > 1
        ? `Salus — Plano ${plano.nome} (+ overages/adicionais) — ${fatura.competencia.slice(5, 7)}/${fatura.competencia.slice(0, 4)}`
        : `Salus — plano ${plano.nome} — ${fatura.competencia.slice(5, 7)}/${fatura.competencia.slice(0, 4)}`;
      remota = await gateway.criarCobranca({
        cliente: clienteId,
        forma: "UNDEFINED",
        valorCentavos: fatura.valorCentavos,
        vencimento: fatura.vencimento,
        descricao,
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

// ---------------------------------------------------------------------------
// Licença individual do prontuário (add-on por profissional)
// ---------------------------------------------------------------------------
// 15 dias grátis. Depois, quem ativou define quem paga: o admin (responsavel "espaco") → item na
// fatura mensal do Salus; o próprio profissional (responsavel "profissional") → cobrança própria
// de 30 dias por pagamento, no preço do plano. Sem licença válida o prontuário fica só leitura.
// Regra de estado em src/domain/cobranca.ts (estadoLicencaProntuario).

type LinhaLicenca = typeof licencasProntuario.$inferSelect;

const STATUS_PAGO_ASAAS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const STATUS_EM_ABERTO_ASAAS = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"]);

async function licencaDoProfissional(tx: Transaction, profissionalId: string): Promise<LinhaLicenca | null> {
  const [l] = await tx.select().from(licencasProntuario).where(eq(licencasProntuario.profissionalId, profissionalId));
  return l ?? null;
}

/** Bloqueia escrever no prontuário sem licença válida (chamado na transação da escrita). */
export async function exigirLicencaProntuario(tx: Transaction, profissionalId: string, agora = new Date()): Promise<void> {
  const licenca = await licencaDoProfissional(tx, profissionalId);
  const estado = estadoLicencaProntuario(licenca, agora);
  if (estado === "inativa") {
    throw new ErroNegocio("Ative o prontuário eletrônico (15 dias grátis) para registrar evoluções.");
  }
  if (estado === "aguardando_pagamento") {
    throw new ErroNegocio("O pagamento do seu prontuário venceu: pague para voltar a registrar. Os registros continuam disponíveis para leitura.");
  }
}

/** Profissional alvo: o próprio (papel profissional) ou o informado pelo admin. */
async function profissionalAlvo(tx: Transaction, ctx: ContextoTenant, informado?: string): Promise<string> {
  if (ctx.role === "profissional") {
    const meu = await profissionalDoUsuario(tx, ctx.userId);
    if (!meu) throw new ErroNegocio("Perfil profissional não encontrado");
    if (informado && informado !== meu.id) throw new ErroNegocio("Você só pode gerenciar a licença do seu próprio perfil profissional");
    return meu.id;
  }
  exigirPermissao(ctx.role, "tenant.configurar");
  if (!informado) throw new ErroNegocio("Profissional não especificado");
  return informado;
}

/**
 * Ativa a licença. Pelo admin: paga pelo espaço. Pelo profissional: paga por ele depois do teste.
 * O teste de 15 dias só vale na primeira ativação.
 */
export async function ativarLicencaProntuario(ctx: ContextoTenant, profissionalIdInformado: string, agora = new Date(), database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await profissionalAlvo(tx, ctx, profissionalIdInformado);
      const [prof] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
      if (!prof) throw new ErroNegocio("Profissional não encontrado");
      const responsavel = ctx.role === "profissional" ? "profissional" : "espaco";
      const existente = await licencaDoProfissional(tx, profissionalId);

      if (existente) {
        // Licença já ativa paga pelo espaço continua com o espaço quando o profissional "reativa".
        const manterEspaco = existente.ativo && existente.responsavel === "espaco";
        await tx
          .update(licencasProntuario)
          .set({ ativo: true, ativadoEm: agora, responsavel: manterEspaco ? "espaco" : responsavel, atualizadoEm: agora })
          .where(eq(licencasProntuario.id, existente.id));
      } else {
        await tx.insert(licencasProntuario).values({
          profissionalId,
          ativo: true,
          responsavel,
          statusPagamento: "trial",
          trialInicioEm: agora,
          trialFimEm: new Date(agora.getTime() + DIAS_DE_TRIAL_PRONTUARIO * 24 * 60 * 60 * 1000),
          ativadoEm: agora,
        });
      }

      await registrarAuditoria(tx, {
        acao: "prontuario.licenca_ativada",
        entidade: "profissionais",
        entidadeId: profissionalId,
        dados: { profissionalNome: prof.nome, responsavel },
      });
    },
    database,
  );
}

export async function desativarLicencaProntuario(ctx: ContextoTenant, profissionalId: string, database?: Database) {
  exigirPermissao(ctx.role, "tenant.configurar");
  return withTenant(
    ctx,
    async (tx) => {
      await tx.update(licencasProntuario).set({ ativo: false }).where(eq(licencasProntuario.profissionalId, profissionalId));
      await registrarAuditoria(tx, { acao: "prontuario.licenca_desativada", entidade: "profissionais", entidadeId: profissionalId });
    },
    database,
  );
}

/**
 * Cobrança própria do profissional (30 dias, preço do plano) na conta da plataforma. Reaproveita a
 * cobrança em aberto; cada nova cobrança tem referência única ("prontuario_prof:<tenant>:<prof>:<ms>").
 */
export async function gerarCobrancaProntuarioProfissional(ctx: ContextoTenant, profissionalIdInformado?: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  const agora = opcoes.agora ?? new Date();

  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await profissionalAlvo(tx, ctx, profissionalIdInformado);
      const [prof] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
      if (!prof) throw new ErroNegocio("Profissional não encontrado");
      const plano = await planoDoTenant(tx);
      const valorCentavos = plano?.precoProntuarioCentavos ?? 4990;
      let licenca = await licencaDoProfissional(tx, profissionalId);

      if (licenca?.ativo && licenca.responsavel === "espaco") {
        throw new ErroNegocio("Esta licença é paga pelo espaço, na fatura mensal do Salus: não há o que pagar aqui.");
      }

      if (licenca?.statusPagamento === "pendente" && licenca.asaasPaymentId) {
        let emAberto = gateway.ambiente === "simulado";
        if (!emAberto) {
          const remota = await gateway.consultarCobranca(licenca.asaasPaymentId).catch(() => null);
          emAberto = Boolean(remota && !remota.removida && STATUS_EM_ABERTO_ASAAS.has(remota.status));
        }
        if (emAberto) return { invoiceUrl: licenca.invoiceUrl, asaasPaymentId: licenca.asaasPaymentId, valorCentavos: licenca.valorCentavos };
      }

      if (!licenca) {
        [licenca] = await tx
          .insert(licencasProntuario)
          .values({ profissionalId, ativo: false, responsavel: "profissional", statusPagamento: "nenhum" })
          .returning();
      }

      if (!licenca.asaasCustomerId && !prof.documento) {
        throw new ErroNegocio("Falta o CPF do profissional no cadastro (Profissionais) para gerar a cobrança.");
      }
      const clienteId =
        licenca.asaasCustomerId ??
        (await gateway.criarCliente({ nome: prof.nome, email: prof.email, cpfCnpj: prof.documento!, referencia: `prof:${profissionalId}` })).id;
      const remota = await gateway.criarCobranca({
        cliente: clienteId,
        forma: "UNDEFINED",
        valorCentavos,
        vencimento: somarDias(hojeNoFuso("America/Sao_Paulo", agora), 3),
        descricao: `Salus — Prontuário eletrônico (${prof.nome}) — 30 dias`,
        referencia: `prontuario_prof:${ctx.tenantId}:${profissionalId}:${agora.getTime()}`,
      });

      await tx
        .update(licencasProntuario)
        .set({
          responsavel: "profissional",
          asaasCustomerId: clienteId,
          asaasPaymentId: remota.id,
          invoiceUrl: remota.invoiceUrl,
          statusPagamento: "pendente",
          valorCentavos,
          atualizadoEm: agora,
        })
        .where(eq(licencasProntuario.id, licenca.id));

      await registrarAuditoria(tx, {
        acao: "prontuario.cobranca_gerada",
        entidade: "licencas_prontuario",
        entidadeId: profissionalId,
        dados: { profissionalNome: prof.nome, asaasPaymentId: remota.id, valorCentavos },
      });

      return { invoiceUrl: remota.invoiceUrl, asaasPaymentId: remota.id, valorCentavos };
    },
    database,
  );
}

/** Baixa da cobrança em aberto da licença: ativa e estende 30 dias. Idempotente por cobrança. */
async function aplicarPagamentoLicenca(tx: Transaction, licenca: LinhaLicenca, paymentId: string, agora: Date, origem: string): Promise<boolean> {
  if (licenca.asaasPaymentId !== paymentId || licenca.statusPagamento !== "pendente") return false;
  const pagoAte = estenderPagamentoProntuario(licenca.pagoAte, agora);
  await tx
    .update(licencasProntuario)
    .set({ ativo: true, statusPagamento: "pago", pagoEm: agora, pagoAte, ativadoEm: licenca.ativadoEm ?? agora, atualizadoEm: agora })
    .where(eq(licencasProntuario.id, licenca.id));
  await registrarAuditoria(tx, {
    acao: "prontuario.pagamento_confirmado",
    entidade: "licencas_prontuario",
    entidadeId: licenca.profissionalId,
    dados: { asaasPaymentId: paymentId, pagoAte: pagoAte.toISOString(), origem },
  });
  return true;
}

/** "Já paguei": confere a cobrança em aberto no gateway (no simulado, confirma na hora). */
export async function confirmarPagamentoProntuario(ctx: ContextoTenant, profissionalIdInformado?: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  const agora = opcoes.agora ?? new Date();

  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await profissionalAlvo(tx, ctx, profissionalIdInformado);
      const licenca = await licencaDoProfissional(tx, profissionalId);
      if (!licenca?.asaasPaymentId || licenca.statusPagamento !== "pendente") {
        const ativa = estadoLicencaProntuario(licenca, agora) === "ativa";
        return {
          confirmado: ativa,
          ativo: ativa,
          mensagem: ativa ? "O prontuário já está ativo e pago." : "Não há cobrança em aberto: gere a cobrança para pagar.",
        };
      }

      let pago = gateway.ambiente === "simulado";
      if (!pago) {
        try {
          const remota = await gateway.consultarCobranca(licenca.asaasPaymentId);
          pago = Boolean(remota && !remota.removida && STATUS_PAGO_ASAAS.has(remota.status));
        } catch (e) {
          if (!(e instanceof ErroGateway)) throw e;
        }
      }
      if (!pago) {
        return {
          confirmado: false,
          ativo: licenca.ativo,
          mensagem: "Pagamento ainda não confirmado pelo gateway. Caso tenha acabado de pagar via Pix, aguarde alguns instantes e tente novamente.",
        };
      }

      await aplicarPagamentoLicenca(tx, licenca, licenca.asaasPaymentId, agora, "confirmacao");
      return { confirmado: true, ativo: true, mensagem: "Pagamento confirmado! O seu prontuário eletrônico está ativo." };
    },
    database,
  );
}

/** Licença do profissional logado (banner e telas do prontuário). */
export async function obterStatusLicencaProntuarioProfissional(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const meu = await profissionalDoUsuario(tx, ctx.userId);
      if (!meu) return { possuiPerfilProfissional: false as const };
      const [prof] = await tx
        .select({ id: profissionais.id, nome: profissionais.nome, email: profissionais.email, ativo: profissionais.ativo })
        .from(profissionais)
        .where(eq(profissionais.id, meu.id));
      const licenca = await licencaDoProfissional(tx, prof.id);
      const plano = await planoDoTenant(tx);
      const estado = estadoLicencaProntuario(licenca, agora);
      const trialFimEm = licenca?.trialFimEm ?? null;
      const emTrial = estado === "teste";
      const diasRestantes = emTrial && trialFimEm ? Math.max(0, Math.ceil((trialFimEm.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000))) : 0;

      return {
        possuiPerfilProfissional: true as const,
        profissionalId: prof.id,
        profissionalNome: prof.nome,
        profissionalEmail: prof.email,
        profissionalAtivo: prof.ativo,
        estado,
        podeEscrever: licencaPermiteEscrita(licenca, agora),
        responsavel: licenca?.responsavel ?? "profissional",
        ativo: licenca?.ativo ?? false,
        emTrial,
        trialFimEm,
        jaTeveTeste: Boolean(licenca?.trialInicioEm),
        diasRestantes,
        statusPagamento: licenca?.statusPagamento ?? "nenhum",
        asaasPaymentId: licenca?.asaasPaymentId ?? null,
        invoiceUrl: licenca?.invoiceUrl ?? null,
        valorCentavos: plano?.precoProntuarioCentavos ?? licenca?.valorCentavos ?? 4990,
        pagoEm: licenca?.pagoEm ?? null,
        pagoAte: licenca?.pagoAte ?? null,
      };
    },
    database,
  );
}

/** Webhook da cobrança própria do prontuário: deduplica pelo evento e confere a cobrança atual. */
async function processarWebhookLicenca(
  tenantId: string,
  profissionalId: string,
  payload: { id: string; event?: string; payment: { id: string } },
  gateway: GatewayCobranca,
  agora: Date,
  database: Database,
): Promise<"ok" | "duplicado" | "ignorado"> {
  const registro = await withSistema(
    tenantId,
    async (tx) => {
      const licenca = await licencaDoProfissional(tx, profissionalId);
      if (!licenca || licenca.asaasPaymentId !== payload.payment.id) return null;
      const inseridos = await tx
        .insert(eventosWebhook)
        .values({ origem: "asaas_plataforma", eventoId: payload.id, tipo: payload.event ?? "desconhecido", payload: payload as Record<string, unknown> })
        .onConflictDoNothing()
        .returning({ id: eventosWebhook.id });
      return { duplicado: inseridos.length === 0 };
    },
    database,
  );
  if (!registro) return "ignorado";
  if (registro.duplicado) return "duplicado";
  const remota = await gateway.consultarCobranca(payload.payment.id);
  if (!remota || remota.removida || !STATUS_PAGO_ASAAS.has(remota.status)) return "ok";
  await withSistema(
    tenantId,
    async (tx) => {
      const licenca = await licencaDoProfissional(tx, profissionalId);
      if (licenca) await aplicarPagamentoLicenca(tx, licenca, payload.payment.id, agora, "webhook");
    },
    database,
  );
  return "ok";
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
  if (partes[0] === "prontuario_prof") {
    const [, tenantId, profissionalId] = partes;
    if (!payload.id || !payload.payment?.id || !z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(profissionalId).success) return "ignorado";
    return processarWebhookLicenca(tenantId, profissionalId, { id: payload.id, event: payload.event, payment: { id: payload.payment.id } }, gateway, agora, database);
  }

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

