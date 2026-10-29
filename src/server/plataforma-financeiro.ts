import { asc, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { condicoesComerciaisTenant, creditosTenant, cupons, descontosTenant, tenants } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant, withUser } from "../db/tenant";
import { competenciaCobravel, descontoVigente, primeiraCompetenciaCobrada } from "../domain/cobranca";
import { competenciaDe } from "../domain/financeiro";
import { exigirPermissao } from "../domain/rbac";
import { hojeNoFuso } from "../domain/tempo";
import { previaDaFatura } from "./assinatura";
import { ErroNegocio } from "./erros";
import { exigirAcessoPlataforma } from "./plataforma";

// Gestão financeira da plataforma por clínica: condições negociadas (preço próprio, dia de
// vencimento, carência), descontos recorrentes, créditos avulsos e cupons. Tudo grava pelas
// funções app_plataforma_* (migration 0047), que conferem o papel e auditam.

const MENSAGENS: Record<string, string> = {
  "clinica.nao_encontrada": "Clínica não encontrada",
  "desconto.periodo_invalido": "O fim do desconto não pode ser antes do início",
  "desconto.nao_encontrado": "Desconto não encontrado ou já revogado",
  "credito.nao_encontrado": "Crédito não encontrado ou já revogado",
  "cupom.codigo_invalido": "Código do cupom: 3 a 30 letras, números, - ou _",
  "cupom.codigo_duplicado": "Já existe um cupom com este código",
  "cupom.nao_encontrado": "Cupom não encontrado",
  "cupom.invalido": "Cupom inválido ou desativado",
  "cupom.expirado": "Este cupom expirou",
  "cupom.esgotado": "Este cupom atingiu o limite de usos",
  "cupom.plano": "Este cupom não vale para o plano do espaço",
  "cupom.ja_usado": "Este cupom já foi usado neste espaço",
  "cupom.ja_tem": "O espaço já tem um cupom ativo",
  "fatura.nao_encontrada": "Fatura não encontrada",
  "fatura.nao_aberta": "A fatura não está mais em aberto",
  "fatura.vencimento_passado": "O vencimento não pode ser no passado",
  "fatura.ajuste_zero": "Informe um valor diferente de zero",
  "fatura.ajuste_negativo": "O ajuste deixaria a fatura negativa",
  "fatura.pagamento_futuro": "A data do pagamento não pode ser no futuro",
  "fatura.sem_itens": "Inclua ao menos um item com valor",
  "acordo.sem_faturas": "Escolha ao menos uma fatura em aberto",
  "acordo.faturas_invalidas": "Só entram no acordo faturas desta clínica ainda em aberto",
  "acordo.parcelas_invalidas": "De 1 a 24 parcelas",
  "acordo.desconto_invalido": "O desconto precisa ser menor que o total",
  "acordo.soma_invalida": "A soma das parcelas precisa fechar com o total do acordo",
  "acordo.datas_invalidas": "Cada parcela precisa vencer depois da anterior, a partir de hoje",
  "acordo.nao_ativo": "Este acordo não está mais ativo",
};

export function traduzirErroFinanceiro(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.excecaoPlpgsql && MENSAGENS[pg.message]) throw new ErroNegocio(MENSAGENS[pg.message]);
  throw erro;
}

const centavosOpcional = z.number().int().min(0, "Valor não pode ser negativo").max(100_000_000).nullable();

export const condicoesSchema = z.object({
  precoMensalCentavos: centavosOpcional,
  precoSalaExtraCentavos: centavosOpcional,
  precoProfissionalExtraCentavos: centavosOpcional,
  precoUnidadeExtraCentavos: centavosOpcional,
  precoProntuarioCentavos: centavosOpcional,
  diaVencimento: z.number().int().min(1, "Dia de vencimento entre 1 e 28").max(28, "Dia de vencimento entre 1 e 28").nullable(),
  diasCarencia: z.number().int().min(0, "Carência entre 0 e 90 dias").max(90, "Carência entre 0 e 90 dias").nullable(),
  observacao: z.string().trim().max(500, "Observação até 500 caracteres").default(""),
});

export async function salvarCondicoesComerciais(userId: string, tenantId: string, dados: z.input<typeof condicoesSchema>, database?: Database) {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = condicoesSchema.parse(dados);
  await withUser(
    userId,
    (tx) => tx.execute(sql`select app_plataforma_salvar_condicoes(${z.uuid().parse(tenantId)}, ${JSON.stringify(d)}::jsonb)`).catch(traduzirErroFinanceiro),
    database,
  );
}

const competenciaSchema = z.iso.date("Data inválida").transform((d) => `${d.slice(0, 7)}-01`);

export const descontoSchema = z
  .object({
    tipo: z.enum(["percentual", "valor"], { error: "Escolha percentual ou valor" }),
    valor: z.number({ error: "Informe o valor do desconto" }).int().positive("O desconto precisa ser maior que zero"),
    inicio: competenciaSchema,
    fim: competenciaSchema.nullable(),
    motivo: z.string().trim().min(3, "Informe o motivo").max(200, "Motivo até 200 caracteres"),
  })
  .refine((d) => d.tipo !== "percentual" || d.valor <= 100, { message: "Percentual de 1 a 100", path: ["valor"] })
  .refine((d) => !d.fim || d.fim >= d.inicio, { message: "O fim do desconto não pode ser antes do início", path: ["fim"] });

export async function criarDescontoClinica(userId: string, tenantId: string, dados: z.input<typeof descontoSchema>, database?: Database): Promise<string> {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = descontoSchema.parse(dados);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(
          sql`select app_plataforma_criar_desconto(${z.uuid().parse(tenantId)}, ${d.tipo}, ${d.valor}, ${d.inicio}::date, ${d.fim}::date, ${d.motivo}) as id`,
        )
        .catch(traduzirErroFinanceiro);
      return rows[0].id;
    },
    database,
  );
}

export async function revogarDescontoClinica(userId: string, descontoId: string, database?: Database) {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_revogar_desconto(${z.uuid().parse(descontoId)})`).catch(traduzirErroFinanceiro), database);
}

export const creditoSchema = z.object({
  valorCentavos: z.number({ error: "Informe o valor do crédito" }).int().positive("O crédito precisa ser maior que zero").max(100_000_000),
  motivo: z.string().trim().min(3, "Informe o motivo").max(200, "Motivo até 200 caracteres"),
});

export async function lancarCreditoClinica(userId: string, tenantId: string, dados: z.input<typeof creditoSchema>, database?: Database): Promise<string> {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = creditoSchema.parse(dados);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(sql`select app_plataforma_lancar_credito(${z.uuid().parse(tenantId)}, ${d.valorCentavos}, ${d.motivo}) as id`)
        .catch(traduzirErroFinanceiro);
      return rows[0].id;
    },
    database,
  );
}

export async function revogarCreditoClinica(userId: string, creditoId: string, database?: Database) {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_revogar_credito(${z.uuid().parse(creditoId)})`).catch(traduzirErroFinanceiro), database);
}

/** Próxima competência que ainda vai ser faturada (depois do teste, se houver). */
function proximaCompetencia(testeAte: string | null, hoje: string, jaFaturada: (c: string) => boolean): string {
  let competencia = competenciaDe(hoje);
  if (!competenciaCobravel(testeAte, competencia) && testeAte) competencia = primeiraCompetenciaCobrada(testeAte);
  while (jaFaturada(competencia)) competencia = primeiraCompetenciaCobrada(competencia);
  return competencia;
}

/** Tudo da aba Cobrança da ficha da clínica: condições, descontos, créditos e prévia da próxima fatura. */
export async function obterCobrancaDaClinica(userId: string, tenantId: string, agora = new Date(), database?: Database) {
  await exigirAcessoPlataforma(userId, "ver", database);
  const id = z.uuid().parse(tenantId);
  const dados = await withSistema(
    id,
    async (tx) => {
      const [tenant] = await tx.select({ testeAte: tenants.testeAte }).from(tenants);
      if (!tenant) throw new ErroNegocio("Clínica não encontrada");
      const [condicoes] = await tx.select().from(condicoesComerciaisTenant);
      const descontos = await tx.select().from(descontosTenant).orderBy(desc(descontosTenant.criadoEm));
      const creditos = await tx.select().from(creditosTenant).orderBy(asc(creditosTenant.criadoEm));
      const { rows } = await tx.execute<{ competencia: string }>(sql`select competencia::text from faturas_saas where tipo = 'mensal'`);
      return { tenant, condicoes: condicoes ?? null, descontos, creditos, faturadas: new Set(rows.map((r) => r.competencia)) };
    },
    database,
  );
  const hoje = hojeNoFuso("America/Sao_Paulo", agora);
  const competencia = proximaCompetencia(dados.tenant.testeAte, hoje, (c) => dados.faturadas.has(c));
  const previa = await previaDaFatura(id, competencia, agora, database);
  return {
    condicoes: dados.condicoes,
    descontos: dados.descontos.map((d) => ({ ...d, vigenteNaProxima: descontoVigente(d, competencia) })),
    creditos: dados.creditos,
    proxima: previa ? { competencia, vencimento: previa.vencimento, itens: previa.calculo.itens, valorTotalCentavos: previa.calculo.valorTotalCentavos } : null,
  };
}

// ---------------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------------

export type Cupom = typeof cupons.$inferSelect;

export async function listarCupons(userId: string, database?: Database): Promise<Cupom[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<Record<string, unknown>>(sql`select * from app_plataforma_cupons()`);
      return rows.map((r) => ({
        id: r.id as string,
        codigo: r.codigo as string,
        descricao: (r.descricao as string | null) ?? null,
        tipo: r.tipo as "percentual" | "valor",
        valor: Number(r.valor),
        duracaoMeses: r.duracao_meses === null ? null : Number(r.duracao_meses),
        validoAte: (r.valido_ate as string | null) ?? null,
        maxUsos: r.max_usos === null ? null : Number(r.max_usos),
        usos: Number(r.usos),
        planosIds: (r.planos_ids as string[] | null) ?? null,
        ativo: Boolean(r.ativo),
        criadoPor: (r.criado_por as string | null) ?? null,
        criadoEm: new Date(r.criado_em as string),
        atualizadoEm: new Date(r.atualizado_em as string),
      }));
    },
    database,
  );
}

export const cupomSchema = z
  .object({
    codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Código do cupom: 3 a 30 letras, números, - ou _"),
    descricao: z.string().trim().max(200).default(""),
    tipo: z.enum(["percentual", "valor"], { error: "Escolha percentual ou valor" }),
    valor: z.number({ error: "Informe o valor do desconto" }).int().positive("O desconto precisa ser maior que zero"),
    duracaoMeses: z.number().int().min(1, "Duração de 1 a 120 meses").max(120, "Duração de 1 a 120 meses").nullable(),
    validoAte: z.iso.date("Data inválida").nullable(),
    maxUsos: z.number().int().positive("Limite de usos maior que zero").nullable(),
    planosIds: z.array(z.uuid()).default([]),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== "percentual" || c.valor <= 100, { message: "Percentual de 1 a 100", path: ["valor"] });

export async function salvarCupom(userId: string, cupomId: string | null, dados: z.input<typeof cupomSchema>, database?: Database): Promise<string> {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = cupomSchema.parse(dados);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(sql`select app_plataforma_salvar_cupom(${cupomId ? z.uuid().parse(cupomId) : null}::uuid, ${JSON.stringify(d)}::jsonb) as id`)
        .catch(traduzirErroFinanceiro);
      return rows[0].id;
    },
    database,
  );
}

/** Ativa ou desativa um cupom sem mexer no resto. */
export async function alternarCupom(userId: string, cupomId: string, ativo: boolean, database?: Database) {
  const cupom = (await listarCupons(userId, database)).find((c) => c.id === cupomId);
  if (!cupom) throw new ErroNegocio("Cupom não encontrado");
  await salvarCupom(
    userId,
    cupomId,
    {
      codigo: cupom.codigo,
      descricao: cupom.descricao ?? "",
      tipo: cupom.tipo,
      valor: cupom.valor,
      duracaoMeses: cupom.duracaoMeses,
      validoAte: cupom.validoAte,
      maxUsos: cupom.maxUsos,
      planosIds: cupom.planosIds ?? [],
      ativo,
    },
    database,
  );
}

/** Admin do espaço aplica um cupom (tela Assinatura). */
export async function aplicarCupomNoEspaco(ctx: ContextoTenant, codigo: string, database?: Database) {
  exigirPermissao(ctx.role, "assinatura.ver");
  const limpo = z.string().trim().min(3, "Informe o código do cupom").max(30, "Código inválido").parse(codigo);
  await withTenant(ctx, (tx) => tx.execute(sql`select app_aplicar_cupom(${limpo})`).catch(traduzirErroFinanceiro), database);
}

/** Condições, descontos ativos e créditos com saldo, vistos pelo próprio espaço (tela Assinatura). */
export async function condicoesDoEspaco(ctx: ContextoTenant, database?: Database) {
  exigirPermissao(ctx.role, "assinatura.ver");
  return withTenant(
    ctx,
    async (tx) => ({
      descontos: (await tx.select().from(descontosTenant).orderBy(desc(descontosTenant.criadoEm))).filter((d) => !d.revogadoEm),
      creditos: (await tx.select().from(creditosTenant)).filter((c) => !c.revogadoEm && c.saldoCentavos > 0),
      condicoes: (await tx.select().from(condicoesComerciaisTenant))[0] ?? null,
    }),
    database,
  );
}
