import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import {
  configuracoesFiscais,
  fechamentos,
  lancamentos,
  notasFiscais,
  profissionais,
  tenantSettings,
  tenants,
} from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { descricaoDaNota, montarDps, pendenciasDaConfiguracao, type ConfigFiscal } from "../domain/fiscal";
import { exigirPermissao, pode } from "../domain/rbac";
import { cifrar, decifrar } from "./cripto";
import { ErroNegocio } from "./erros";
import { competenciaSchema, TIPOS_RECEITA } from "./financeiro";
import {
  EmissorFocusNfe,
  EmissorSimulado,
  ErroComunicacaoFiscal,
  type EmissorNfse,
  type SituacaoNota,
} from "./fiscal-provider";
import { profissionalDoUsuario } from "./profissionais";

/** Notas pendentes desistem de reenviar depois disso (ficam visíveis para ação manual). */
const MAX_TENTATIVAS_ENVIO = 10;

type LinhaConfig = typeof configuracoesFiscais.$inferSelect;

export type FabricaEmissor = (config: LinhaConfig) => EmissorNfse;

/** Emissor real conforme o ambiente configurado no tenant. */
export const emissorDaConfiguracao: FabricaEmissor = (config) => {
  if (config.ambiente === "simulado") return new EmissorSimulado();
  if (!config.tokenCifrado) throw new ErroNegocio("Token da Focus NFe não configurado");
  return new EmissorFocusNfe(decifrar(config.tokenCifrado), config.ambiente);
};

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

async function carregarConfig(tx: Transaction) {
  const [config] = await tx.select().from(configuracoesFiscais);
  const [tenant] = await tx.select({ tipoDocumento: tenants.tipoDocumento, documento: tenants.documento }).from(tenants);
  const [settings] = await tx.select({ timezone: tenantSettings.timezone }).from(tenantSettings);
  return {
    linha: config ?? null,
    cnpjPrestador: tenant?.tipoDocumento === "cnpj" ? tenant.documento : "",
    timezone: settings?.timezone ?? "America/Sao_Paulo",
  };
}

function paraConfigFiscal(linha: LinhaConfig, cnpjPrestador: string): ConfigFiscal {
  return {
    cnpjPrestador,
    inscricaoMunicipal: linha.inscricaoMunicipal,
    codigoMunicipio: linha.codigoMunicipio,
    opcaoSimplesNacional: linha.opcaoSimplesNacional,
    regimeTributarioSimplesNacional: linha.regimeTributarioSimplesNacional,
    regimeEspecialTributacao: linha.regimeEspecialTributacao,
    codigoTributacaoNacional: linha.codigoTributacaoNacional,
    codigoNbs: linha.codigoNbs,
    aliquotaIssBp: linha.aliquotaIssBp,
    serieDps: linha.serieDps,
  };
}

function pendencias(linha: LinhaConfig | null, cnpjPrestador: string): string[] {
  if (!linha) return ["Configure os dados fiscais do espaço"];
  return pendenciasDaConfiguracao({
    ...paraConfigFiscal(linha, cnpjPrestador),
    ambiente: linha.ambiente,
    tokenConfigurado: Boolean(linha.tokenCifrado),
  });
}

export async function obterConfiguracaoFiscal(ctx: ContextoTenant, database?: Database) {
  exigirPermissao(ctx.role, "fiscal.ver");
  return withTenant(
    ctx,
    async (tx) => {
      const { linha, cnpjPrestador } = await carregarConfig(tx);
      const { tokenCifrado, ...semToken } = linha ?? ({} as LinhaConfig);
      return {
        config: linha ? { ...semToken, tokenConfigurado: Boolean(tokenCifrado) } : null,
        cnpjPrestador,
        pendencias: pendencias(linha, cnpjPrestador),
      };
    },
    database,
  );
}

const digitosOpcionais = (tamanho: number, rotulo: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || v.length === tamanho, `${rotulo} deve ter ${tamanho} dígitos`);

export const configuracaoFiscalSchema = z.object({
  ativo: z.boolean(),
  ambiente: z.enum(["simulado", "homologacao", "producao"]),
  /** Vazio = mantém o token atual; "-" = remove. */
  token: z.string().trim().optional(),
  inscricaoMunicipal: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform((v) => v || null),
  codigoMunicipio: digitosOpcionais(7, "O código IBGE do município"),
  opcaoSimplesNacional: z.number().int().min(1).max(3),
  regimeTributarioSimplesNacional: z.number().int().min(1).max(3).nullable(),
  regimeEspecialTributacao: z.number().int().min(0).max(9),
  codigoTributacaoNacional: digitosOpcionais(6, "O código de tributação nacional"),
  codigoNbs: digitosOpcionais(9, "O código NBS"),
  aliquotaIssBp: z.number().int().min(1).max(10_000).nullable(),
  descricaoServico: z.string().trim().min(5, "Descreva o serviço").max(500),
  serieDps: z.number().int().min(1).max(99999),
});

export async function salvarConfiguracaoFiscal(
  ctx: ContextoTenant,
  dados: z.input<typeof configuracaoFiscalSchema>,
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "fiscal.configurar");
  const { token, ...valores } = configuracaoFiscalSchema.parse(dados);
  await withTenant(
    ctx,
    async (tx) => {
      const tokenCifrado = token === "-" ? null : token ? cifrar(token) : undefined;
      const conjunto = { ...valores, ...(tokenCifrado === undefined ? {} : { tokenCifrado }) };
      await tx
        .insert(configuracoesFiscais)
        .values(conjunto)
        .onConflictDoUpdate({ target: configuracoesFiscais.tenantId, set: conjunto });
      const { linha, cnpjPrestador } = await carregarConfig(tx);
      if (valores.ativo && pendencias(linha, cnpjPrestador).length > 0) {
        throw new ErroNegocio(`Não é possível ativar: ${pendencias(linha, cnpjPrestador).join("; ")}`);
      }
      // Token nunca vai para o audit_log.
      await registrarAuditoria(tx, {
        acao: "fiscal.configurado",
        entidade: "configuracoes_fiscais",
        dados: { ...valores, tokenAlterado: tokenCifrado !== undefined },
      });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

/** Receita de locação (líquida de estornos) do profissional na competência = valor da nota. */
async function receitaDeLocacao(tx: Transaction, profissionalId: string, competencia: string): Promise<number> {
  const [linha] = await tx
    .select({
      total: sql<string>`coalesce(sum(case when ${lancamentos.natureza} = 'debito' then ${lancamentos.valorCentavos} else -${lancamentos.valorCentavos} end), 0)`,
    })
    .from(lancamentos)
    .where(
      and(
        eq(lancamentos.profissionalId, profissionalId),
        eq(lancamentos.competencia, competencia),
        inArray(lancamentos.tipo, TIPOS_RECEITA),
      ),
    );
  return Number(linha.total);
}

/** Cria a nota "pendente" com número de DPS reservado. Não fala com a Focus. */
async function prepararNota(tx: Transaction, profissionalId: string, competencia: string): Promise<{ id: string }> {
  const { linha, cnpjPrestador } = await carregarConfig(tx);
  if (!linha?.ativo) throw new ErroNegocio("A emissão de NFS-e não está ativada (Fiscal → Configuração)");
  const falta = pendencias(linha, cnpjPrestador);
  if (falta.length > 0) throw new ErroNegocio(falta.join("; "));

  const [fechamento] = await tx
    .select({ status: fechamentos.status })
    .from(fechamentos)
    .where(and(eq(fechamentos.profissionalId, profissionalId), eq(fechamentos.competencia, competencia)));
  if (fechamento?.status !== "fechado") throw new ErroNegocio("Feche o mês do profissional antes de emitir a nota");

  const [profissional] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
  if (!profissional) throw new ErroNegocio("Profissional não encontrado");
  if (!profissional.documento || !profissional.tipoDocumento) {
    throw new ErroNegocio(`Cadastre o CPF ou CNPJ de ${profissional.nome} (tomador da nota)`);
  }
  const valor = await receitaDeLocacao(tx, profissionalId, competencia);
  if (valor <= 0) throw new ErroNegocio("Não há valor de locação a faturar neste mês");

  // Reserva o número da DPS (sequencial por série, sem buracos se a transação falhar).
  const [numeracao] = await tx
    .update(configuracoesFiscais)
    .set({ proximoNumeroDps: sql`${configuracoesFiscais.proximoNumeroDps} + 1` })
    .returning({ numero: sql<number>`${configuracoesFiscais.proximoNumeroDps} - 1`, serie: configuracoesFiscais.serieDps });

  const id = crypto.randomUUID();
  await tx
    .insert(notasFiscais)
    .values({
      id,
      profissionalId,
      competencia,
      valorCentavos: valor,
      descricao: descricaoDaNota(linha.descricaoServico, competencia),
      ambiente: linha.ambiente,
      referencia: `salus-${id}`,
      serieDps: numeracao.serie,
      numeroDps: numeracao.numero,
      tomador: { tipoDocumento: profissional.tipoDocumento, documento: profissional.documento, nome: profissional.nome, email: profissional.email },
    })
    .catch((erro: unknown) => {
      if (erroPostgres(erro)?.code === PG.violacaoUnica) throw new ErroNegocio("Já existe uma nota ativa deste profissional para o mês");
      throw erro;
    });
  await registrarAuditoria(tx, {
    acao: "nfse.preparada",
    entidade: "notas_fiscais",
    entidadeId: id,
    dados: { profissionalId, competencia, valor, numeroDps: numeracao.numero },
  });
  return { id };
}

function camposDaSituacao(s: SituacaoNota) {
  switch (s.status) {
    case "processando":
      return { status: "processando" as const, erros: null };
    case "autorizada":
    case "cancelada":
      return {
        status: s.status,
        numero: s.numero,
        codigoVerificacao: s.codigoVerificacao,
        url: s.url,
        urlDanfse: s.urlDanfse,
        caminhoXml: s.caminhoXml,
        emitidaEm: s.emitidaEm ?? new Date(),
        erros: null,
      };
    case "erro":
      return { status: "erro" as const, erros: s.erros };
    case "nao_encontrada":
      return null;
  }
}

/**
 * Sincroniza uma nota com o emissor. Pendente: consulta antes de enviar (se a Focus já
 * recebeu a referência, só adota o status — nunca duplica). Processando: consulta.
 */
async function sincronizarNota(
  tenantId: string,
  notaId: string,
  fabrica: FabricaEmissor,
  agora: Date,
  database: Database,
): Promise<string> {
  const carregado = await withSistema(
    tenantId,
    async (tx) => {
      const [nota] = await tx.select().from(notasFiscais).where(eq(notasFiscais.id, notaId));
      const { linha, cnpjPrestador, timezone } = await carregarConfig(tx);
      return { nota, linha, cnpjPrestador, timezone };
    },
    database,
  );
  const { nota, linha, cnpjPrestador, timezone } = carregado;
  if (!nota || !linha || (nota.status !== "pendente" && nota.status !== "processando")) return nota?.status ?? "inexistente";

  // A nota usa o ambiente em que foi criada (troca de ambiente não afeta notas antigas).
  const emissor = fabrica({ ...linha, ambiente: nota.ambiente });
  let situacao: SituacaoNota;
  try {
    situacao = await emissor.consultar(nota.referencia);
    if (situacao.status === "nao_encontrada" && nota.status === "pendente") {
      const dps = montarDps(paraConfigFiscal(linha, cnpjPrestador), { ...nota, tomador: nota.tomador }, agora, timezone);
      situacao = await emissor.emitir(nota.referencia, dps);
    }
  } catch (erro) {
    if (!(erro instanceof ErroComunicacaoFiscal)) throw erro;
    await withSistema(
      tenantId,
      (tx) =>
        tx
          .update(notasFiscais)
          .set({ tentativas: nota.tentativas + 1, erros: [{ mensagem: erro.message }] })
          .where(eq(notasFiscais.id, notaId)),
      database,
    );
    return nota.status;
  }

  const campos = camposDaSituacao(situacao);
  if (!campos) return nota.status;
  await withSistema(
    tenantId,
    async (tx) => {
      await tx
        .update(notasFiscais)
        .set({ ...campos, tentativas: nota.tentativas + 1 })
        .where(eq(notasFiscais.id, notaId));
      if (campos.status !== nota.status) {
        await registrarAuditoria(tx, { acao: `nfse.${campos.status}`, entidade: "notas_fiscais", entidadeId: notaId });
      }
    },
    database,
  );
  return campos.status;
}

/** Emite a NFS-e de locação do profissional para a competência fechada. */
export async function emitirNota(
  ctx: ContextoTenant,
  profissionalId: string,
  competencia: string,
  opcoes: { agora?: Date; fabrica?: FabricaEmissor; database?: Database } = {},
) {
  exigirPermissao(ctx.role, "fiscal.emitir");
  const c = competenciaSchema.parse(competencia);
  const database = opcoes.database ?? getDb();
  const { id } = await withTenant(ctx, (tx) => prepararNota(tx, profissionalId, c), database);
  const status = await sincronizarNota(ctx.tenantId, id, opcoes.fabrica ?? emissorDaConfiguracao, opcoes.agora ?? new Date(), database);
  return { id, status };
}

/** Emite para todos os profissionais com mês fechado, valor a faturar e sem nota ativa. */
export async function emitirNotasDoMes(
  ctx: ContextoTenant,
  competencia: string,
  opcoes: { agora?: Date; fabrica?: FabricaEmissor; database?: Database } = {},
) {
  exigirPermissao(ctx.role, "fiscal.emitir");
  const c = competenciaSchema.parse(competencia);
  const candidatos = await withTenant(
    ctx,
    (tx) =>
      tx
        .select({ id: profissionais.id, nome: profissionais.nome })
        .from(fechamentos)
        .innerJoin(profissionais, eq(profissionais.id, fechamentos.profissionalId))
        .where(
          and(
            eq(fechamentos.competencia, c),
            eq(fechamentos.status, "fechado"),
            sql`not exists (select 1 from ${notasFiscais} n where n.profissional_id = ${profissionais.id}
              and n.competencia = ${c} and n.status not in ('erro', 'cancelada'))`,
          ),
        )
        .orderBy(asc(profissionais.nome)),
    opcoes.database,
  );
  const resultado: { nome: string; ok: boolean; mensagem: string }[] = [];
  for (const p of candidatos) {
    try {
      const { status } = await emitirNota(ctx, p.id, c, opcoes);
      resultado.push({ nome: p.nome, ok: status !== "erro", mensagem: status });
    } catch (erro) {
      if (!(erro instanceof ErroNegocio)) throw erro;
      resultado.push({ nome: p.nome, ok: false, mensagem: erro.message });
    }
  }
  return resultado;
}

/** Job do worker: envia pendentes (com consulta prévia) e acompanha as em processamento. */
export async function processarNotasFiscais(
  tenantId: string,
  agora = new Date(),
  fabrica: FabricaEmissor = emissorDaConfiguracao,
  database: Database = getDb(),
) {
  const abertas = await withSistema(
    tenantId,
    (tx) =>
      tx
        .select({ id: notasFiscais.id })
        .from(notasFiscais)
        .where(
          and(
            inArray(notasFiscais.status, ["pendente", "processando"]),
            lt(notasFiscais.tentativas, MAX_TENTATIVAS_ENVIO),
          ),
        )
        .orderBy(asc(notasFiscais.criadoEm))
        .limit(20),
    database,
  );
  const contagem: Record<string, number> = {};
  for (const n of abertas) {
    const status = await sincronizarNota(tenantId, n.id, fabrica, agora, database);
    contagem[status] = (contagem[status] ?? 0) + 1;
  }
  return contagem;
}

export const justificativaSchema = z.string().trim().min(15, "A justificativa precisa de ao menos 15 caracteres").max(255);

export async function cancelarNota(
  ctx: ContextoTenant,
  notaId: string,
  justificativa: string,
  opcoes: { agora?: Date; fabrica?: FabricaEmissor; database?: Database } = {},
) {
  exigirPermissao(ctx.role, "fiscal.emitir");
  const texto = justificativaSchema.parse(justificativa);
  const database = opcoes.database ?? getDb();
  const { nota, linha } = await withTenant(
    ctx,
    async (tx) => {
      const [n] = await tx.select().from(notasFiscais).where(eq(notasFiscais.id, notaId));
      return { nota: n, linha: (await carregarConfig(tx)).linha };
    },
    database,
  );
  if (!nota) throw new ErroNegocio("Nota não encontrada");
  if (nota.status !== "autorizada") throw new ErroNegocio("Só notas autorizadas podem ser canceladas");
  if (!linha) throw new ErroNegocio("Configuração fiscal ausente");

  let resposta: Awaited<ReturnType<EmissorNfse["cancelar"]>>;
  try {
    resposta = await (opcoes.fabrica ?? emissorDaConfiguracao)({ ...linha, ambiente: nota.ambiente }).cancelar(nota.referencia, texto);
  } catch (erro) {
    if (erro instanceof ErroComunicacaoFiscal) throw new ErroNegocio(`${erro.message}. Tente novamente em instantes.`);
    throw erro;
  }
  if (resposta.status === "erro") throw new ErroNegocio(resposta.erros.map((e) => e.mensagem).join("; "));

  await withTenant(
    ctx,
    async (tx) => {
      await tx
        .update(notasFiscais)
        .set({ status: "cancelada", justificativaCancelamento: texto, canceladaEm: opcoes.agora ?? new Date() })
        .where(eq(notasFiscais.id, notaId));
      await registrarAuditoria(tx, { acao: "nfse.cancelada", entidade: "notas_fiscais", entidadeId: notaId, dados: { justificativa: texto } });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listarNotas(ctx: ContextoTenant, competencia: string, database?: Database) {
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      let somente: string | null = null;
      if (!pode(ctx.role, "fiscal.ver")) {
        exigirPermissao(ctx.role, "extrato.proprio");
        somente = (await profissionalDoUsuario(tx, ctx.userId))?.id ?? "00000000-0000-0000-0000-000000000000";
      }
      return tx
        .select({ nota: notasFiscais, profissionalNome: profissionais.nome })
        .from(notasFiscais)
        .innerJoin(profissionais, eq(profissionais.id, notasFiscais.profissionalId))
        .where(and(eq(notasFiscais.competencia, c), somente ? eq(notasFiscais.profissionalId, somente) : undefined))
        .orderBy(asc(profissionais.nome), desc(notasFiscais.criadoEm));
    },
    database,
  );
}

/** Profissionais com mês fechado e valor a faturar ainda sem nota (pendências de emissão). */
export async function pendentesDeEmissao(ctx: ContextoTenant, competencia: string, database?: Database) {
  exigirPermissao(ctx.role, "fiscal.ver");
  const c = competenciaSchema.parse(competencia);
  return withTenant(
    ctx,
    async (tx) => {
      const lista = await tx
        .select({ id: profissionais.id, nome: profissionais.nome, documento: profissionais.documento })
        .from(fechamentos)
        .innerJoin(profissionais, eq(profissionais.id, fechamentos.profissionalId))
        .where(
          and(
            eq(fechamentos.competencia, c),
            eq(fechamentos.status, "fechado"),
            sql`not exists (select 1 from ${notasFiscais} n where n.profissional_id = ${profissionais.id}
              and n.competencia = ${c} and n.status not in ('erro', 'cancelada'))`,
          ),
        )
        .orderBy(asc(profissionais.nome));
      const comValor = [];
      for (const p of lista) {
        const valor = await receitaDeLocacao(tx, p.id, c);
        if (valor > 0) comValor.push({ ...p, valorCentavos: valor });
      }
      return comValor;
    },
    database,
  );
}
