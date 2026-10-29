import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "../db/client";
import {
  auditPlataforma,
  faturasSaas,
  faturasSaasItens,
  licencasProntuario,
  memberships,
  planosSaas,
  profissionais,
  salas,
  tenants,
  unidades,
  users,
} from "../db/schema";
import { erroPostgres } from "../db/erros";
import { withSistema, withUser } from "../db/tenant";
import { estadoLicencaProntuario, statusParaExibir } from "../domain/cobranca";
import { hojeNoFuso } from "../domain/tempo";
import { exigir2FAParaAdmin } from "../auth/dois-fatores";
import { papelPode, ROTULOS_PAPEL_PLATAFORMA, type PapelPlataforma, type PermissaoPlataforma } from "../domain/permissoes-plataforma";
import { ErroNegocio } from "./erros";

export type MetricasPlataforma = {
  totalClinicas: number;
  clinicasAtivas: number;
  clinicasSuspensas: number;
  totalUsuarios: number;
  totalProfissionais: number;
  mrrEstimadoCentavos: number;
};

export type ClinicaPlataforma = {
  id: string;
  nome: string;
  status: "ativo" | "suspenso" | "cancelado";
  documento: string;
  planoCodigo: string;
  planoNome: string;
  planoPrecoCentavos: number;
  membrosCount: number;
  salasCount: number;
  profissionaisCount: number;
  criadoEm: Date;
  testeAte: string | null;
  motivoSuspensao: string | null;
  negociada: boolean;
};

export type UsuarioPlataforma = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  clinicasCount: number;
  createdAt: Date;
};

/** Papel do usuário na equipe Salus (null = fora da equipe). */
export async function papelNaPlataforma(userId: string, database?: Database): Promise<PapelPlataforma | null> {
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ papel: PapelPlataforma | null }>(sql`select app_papel_plataforma() as papel`);
      return rows[0]?.papel ?? null;
    },
    database,
  );
}

export async function ehSuperadmin(userId: string, database?: Database): Promise<boolean> {
  return (await papelNaPlataforma(userId, database)) !== null;
}

/**
 * Porta de toda função da plataforma: o papel precisa da permissão e, quando a verificação em
 * duas etapas é obrigatória, ela precisa estar ativa (o layout redireciona; aqui a action recusa).
 */
export async function exigirAcessoPlataforma(
  userId: string,
  permissao: PermissaoPlataforma = "ver",
  database: Database = getDb(),
): Promise<PapelPlataforma> {
  const papel = await papelNaPlataforma(userId, database);
  if (!papel) throw new ErroNegocio("Acesso negado: área restrita à equipe da plataforma Salus.");
  if (!papelPode(papel, permissao)) {
    throw new ErroNegocio(`Acesso negado: o papel ${ROTULOS_PAPEL_PLATAFORMA[papel]} não permite esta ação.`);
  }
  if (exigir2FAParaAdmin()) {
    const [u] = await database.select({ doisFatores: users.twoFactorEnabled }).from(users).where(eq(users.id, userId));
    if (!u?.doisFatores) throw new ErroNegocio("Ative a verificação em duas etapas para usar a área da plataforma.");
  }
  return papel;
}

export async function exigirSuperadmin(userId: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "ver", database);
}

export async function obterMetricasPlataforma(
  userId: string,
  database?: Database,
): Promise<MetricasPlataforma> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        total_clinicas: string;
        clinicas_ativas: string;
        clinicas_suspensas: string;
        total_usuarios: string;
        total_profissionais: string;
        mrr_estimado_centavos: string;
      }>(sql`select * from app_plataforma_metricas()`);

      const r = rows[0];
      return {
        totalClinicas: Number(r?.total_clinicas || 0),
        clinicasAtivas: Number(r?.clinicas_ativas || 0),
        clinicasSuspensas: Number(r?.clinicas_suspensas || 0),
        totalUsuarios: Number(r?.total_usuarios || 0),
        totalProfissionais: Number(r?.total_profissionais || 0),
        mrrEstimadoCentavos: Number(r?.mrr_estimado_centavos || 0),
      };
    },
    database,
  );
}

export async function listarClinicasPlataforma(
  userId: string,
  database?: Database,
): Promise<ClinicaPlataforma[]> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        nome: string;
        status: "ativo" | "suspenso" | "cancelado";
        documento: string;
        plano_codigo: string;
        plano_nome: string;
        plano_preco_centavos: number;
        membros_count: string;
        salas_count: string;
        profissionais_count: string;
        criado_em: string;
        teste_ate: string | null;
        motivo_suspensao: string | null;
        negociada: boolean;
      }>(sql`select * from app_plataforma_clinicas()`);

      return rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        status: r.status,
        documento: r.documento,
        planoCodigo: r.plano_codigo,
        planoNome: r.plano_nome,
        planoPrecoCentavos: Number(r.plano_preco_centavos),
        membrosCount: Number(r.membros_count),
        salasCount: Number(r.salas_count),
        profissionaisCount: Number(r.profissionais_count),
        criadoEm: new Date(r.criado_em),
        testeAte: r.teste_ate ? String(r.teste_ate).slice(0, 10) : null,
        motivoSuspensao: r.motivo_suspensao,
        negociada: Boolean(r.negociada),
      }));
    },
    database,
  );
}

export async function listarUsuariosPlataforma(
  userId: string,
  database?: Database,
): Promise<UsuarioPlataforma[]> {
  await exigirSuperadmin(userId, database);

  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        name: string;
        email: string;
        role: string;
        banned: boolean;
        ban_reason: string | null;
        clinicas_count: string;
        created_at: string;
      }>(sql`select * from app_plataforma_usuarios()`);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role || "user",
        banned: Boolean(r.banned),
        banReason: r.ban_reason,
        clinicasCount: Number(r.clinicas_count),
        createdAt: new Date(r.created_at),
      }));
    },
    database,
  );
}

export async function listarPlanosDisponiveis(
  userId: string,
  database: Database = getDb(),
) {
  await exigirSuperadmin(userId, database);
  return database.select().from(planosSaas).where(eq(planosSaas.ativo, true));
}

export async function suspenderClinicaPlataforma(
  userId: string,
  tenantId: string,
  motivo: string,
  database?: Database,
): Promise<void> {
  await exigirAcessoPlataforma(userId, "clinicas.gerenciar", database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_suspender_clinica(${tenantId}, ${motivo})`);
    },
    database,
  );
}

export async function reativarClinicaPlataforma(
  userId: string,
  tenantId: string,
  database?: Database,
): Promise<void> {
  await exigirAcessoPlataforma(userId, "clinicas.gerenciar", database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_reativar_clinica(${tenantId})`);
    },
    database,
  );
}

export async function alterarPlanoClinicaPlataforma(
  userId: string,
  tenantId: string,
  planoId: string,
  database?: Database,
): Promise<void> {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_alterar_plano(${tenantId}, ${planoId})`);
    },
    database,
  );
}

export async function banirUsuarioPlataforma(
  userId: string,
  usuarioAlvoId: string,
  motivo: string,
  database?: Database,
): Promise<void> {
  await exigirAcessoPlataforma(userId, "usuarios.banir", database);
  if (usuarioAlvoId === userId) {
    throw new ErroNegocio("Você não pode banir seu próprio usuário superadmin.");
  }
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_banir_usuario(${usuarioAlvoId}, ${motivo})`);
    },
    database,
  );
}

export async function desbanirUsuarioPlataforma(
  userId: string,
  usuarioAlvoId: string,
  database?: Database,
): Promise<void> {
  await exigirAcessoPlataforma(userId, "usuarios.banir", database);
  await withUser(
    userId,
    async (tx) => {
      await tx.execute(sql`select app_plataforma_desbanir_usuario(${usuarioAlvoId})`);
    },
    database,
  );
}

export type FiltrosAuditoriaPlataforma = {
  /** Começo da ação (ex.: "clinica." ou "plataforma.fatura"). */
  acao?: string;
  /** Id do alvo (clínica, fatura, usuário…). */
  alvoId?: string;
  /** Nome ou e-mail de quem fez. */
  pessoa?: string;
  /** Datas AAAA-MM-DD, inclusivas, no fuso de São Paulo. */
  de?: string;
  ate?: string;
  limite?: number;
};

export async function listarAuditoriaPlataforma(
  userId: string,
  limite = 50,
  database: Database = getDb(),
  filtros: Omit<FiltrosAuditoriaPlataforma, "limite"> = {},
) {
  await exigirSuperadmin(userId, database);
  const condicoes = [
    filtros.acao ? ilike(auditPlataforma.acao, `${filtros.acao.replace(/[%_]/g, "")}%`) : undefined,
    filtros.alvoId ? eq(auditPlataforma.alvoId, filtros.alvoId) : undefined,
    filtros.pessoa ? or(ilike(users.name, `%${filtros.pessoa.replace(/[%_]/g, "")}%`), ilike(users.email, `%${filtros.pessoa.replace(/[%_]/g, "")}%`)) : undefined,
    filtros.de && /^\d{4}-\d{2}-\d{2}$/.test(filtros.de) ? sql`${auditPlataforma.criadoEm} >= (${filtros.de}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'` : undefined,
    filtros.ate && /^\d{4}-\d{2}-\d{2}$/.test(filtros.ate)
      ? sql`${auditPlataforma.criadoEm} < (${filtros.ate}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`
      : undefined,
  ];
  return database
    .select({
      id: auditPlataforma.id,
      userId: auditPlataforma.userId,
      userNome: users.name,
      userEmail: users.email,
      acao: auditPlataforma.acao,
      alvoTipo: auditPlataforma.alvoTipo,
      alvoId: auditPlataforma.alvoId,
      dados: auditPlataforma.dados,
      criadoEm: auditPlataforma.criadoEm,
    })
    .from(auditPlataforma)
    .leftJoin(users, eq(users.id, auditPlataforma.userId))
    .where(and(...condicoes))
    .orderBy(desc(auditPlataforma.criadoEm))
    .limit(Math.min(Math.max(limite, 1), 5000));
}

export async function listarPlanosCompletosPlataforma(userId: string, database: Database = getDb()) {
  await exigirSuperadmin(userId, database);
  return database.select().from(planosSaas).orderBy(asc(planosSaas.precoMensalCentavos));
}

const centavosPlano = (rotulo: string) => z.number({ error: `Valor inválido em "${rotulo}"` }).int().min(0, `"${rotulo}" não pode ser negativo`).max(100_000_000);
const limitePlano = (rotulo: string) => z.number({ error: `Limite inválido em "${rotulo}"` }).int().min(1, `O plano precisa de ao menos 1 em "${rotulo}"`).max(100_000);

export const configuracaoPlanoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome do plano").max(60),
    precoMensalCentavos: centavosPlano("Mensalidade"),
    precoSalaExtraCentavos: centavosPlano("Sala extra"),
    precoProfissionalExtraCentavos: centavosPlano("Profissional extra"),
    precoUnidadeExtraCentavos: centavosPlano("Unidade extra"),
    precoProntuarioCentavos: centavosPlano("Prontuário"),
    permiteUnidadeExtra: z.boolean(),
    limites: z.object({ unidades: limitePlano("Unidades"), salas: limitePlano("Salas"), profissionais: limitePlano("Profissionais") }),
  })
  .partial();

/** Edita preço, excedentes e limites de um plano (função SECURITY DEFINER; auditado no banco). */
export async function atualizarConfiguracaoPlano(
  userId: string,
  planoId: string,
  dados: z.input<typeof configuracaoPlanoSchema>,
  database?: Database,
) {
  await exigirAcessoPlataforma(userId, "planos.editar", database);
  const id = z.uuid().parse(planoId);
  const valores = configuracaoPlanoSchema.parse(dados);
  await withUser(
    userId,
    async (tx) => {
      try {
        await tx.execute(sql`select app_plataforma_atualizar_plano(${id}::uuid, ${JSON.stringify(valores)}::jsonb)`);
      } catch (erro) {
        if (erroPostgres(erro)?.message === "plano.nao_encontrado") throw new ErroNegocio("Plano não encontrado.");
        throw erro;
      }
    },
    database,
  );
}

type ItemFaturaPlataforma = {
  id: string;
  tipo: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  valorTotalCentavos: number;
};

/** Faturas do SaaS de todos os espaços (função SECURITY DEFINER: as tabelas têm RLS por tenant). */
export async function obterFaturamentoPlataforma(userId: string, database?: Database) {
  await exigirSuperadmin(userId, database);

  const linhas = await withUser(
    userId,
    async (tx) =>
      (
        await tx.execute<{
          id: string;
          tenant_id: string;
          tenant_nome: string;
          competencia: string;
          vencimento: string;
          valor_centavos: number;
          status: string;
          invoice_url: string | null;
          asaas_payment_id: string | null;
          ultimo_erro: string | null;
          criado_em: Date | string;
          itens: ItemFaturaPlataforma[];
        }>(sql`select * from app_plataforma_faturas(500)`)
      ).rows,
    database,
  );

  // Pendente e já vencida conta como atraso (métricas e etiqueta), como na suspensão do espaço.
  const hoje = hojeNoFuso("America/Sao_Paulo");
  const faturas = linhas.map((f) => ({
    id: f.id,
    tenantId: f.tenant_id,
    tenantNome: f.tenant_nome,
    competencia: String(f.competencia).slice(0, 10),
    vencimento: String(f.vencimento).slice(0, 10),
    valorCentavos: Number(f.valor_centavos),
    status: statusParaExibir(f.status, String(f.vencimento).slice(0, 10), hoje),
    invoiceUrl: f.invoice_url,
    asaasPaymentId: f.asaas_payment_id,
    ultimoErro: f.ultimo_erro,
    criadoEm: new Date(f.criado_em),
  }));
  const itens = linhas.flatMap((f) => f.itens.map((item) => ({ ...item, faturaId: f.id })));
  const itensPorFatura = Object.fromEntries(linhas.map((f) => [f.id, f.itens])) as Record<string, ItemFaturaPlataforma[]>;

  let totalRecebidoCentavos = 0;
  let totalPendenteCentavos = 0;
  let totalVencidoCentavos = 0;

  const breakdownCentavos: Record<string, number> = {
    base: 0,
    sala_extra: 0,
    profissional_extra: 0,
    unidade_extra: 0,
    prontuario_licenca: 0,
  };

  for (const f of faturas) {
    if (f.status === "paga") totalRecebidoCentavos += f.valorCentavos;
    else if (f.status === "pendente") totalPendenteCentavos += f.valorCentavos;
    else if (f.status === "vencida") totalVencidoCentavos += f.valorCentavos;
  }

  for (const it of itens) {
    if (breakdownCentavos[it.tipo] !== undefined) {
      breakdownCentavos[it.tipo] += it.valorTotalCentavos;
    }
  }

  return {
    faturas,
    itensPorFatura,
    metricas: {
      totalRecebidoCentavos,
      totalPendenteCentavos,
      totalVencidoCentavos,
      totalFaturadoCentavos: totalRecebidoCentavos + totalPendenteCentavos + totalVencidoCentavos,
      breakdownCentavos,
    },
  };
}

/** Detalhe de um espaço para o superadmin: lido no contexto de sistema do próprio tenant (RLS). */
export async function obterDetalhesClinicaPlataforma(userId: string, tenantId: string, database?: Database, agora = new Date()) {
  await exigirSuperadmin(userId, database);
  const id = z.uuid().parse(tenantId);

  return withSistema(
    id,
    async (tx) => {
      const [tenant] = await tx
        .select({
          id: tenants.id,
          nome: tenants.nome,
          documento: tenants.documento,
          status: tenants.status,
          criadoEm: tenants.criadoEm,
          testeAte: tenants.testeAte,
          motivoSuspensao: tenants.motivoSuspensao,
          planoId: tenants.planoId,
          planoNome: planosSaas.nome,
          planoCodigo: planosSaas.codigo,
          planoPrecoMensalCentavos: planosSaas.precoMensalCentavos,
          limites: planosSaas.limites,
          precoSalaExtraCentavos: planosSaas.precoSalaExtraCentavos,
          precoProfissionalExtraCentavos: planosSaas.precoProfissionalExtraCentavos,
          precoUnidadeExtraCentavos: planosSaas.precoUnidadeExtraCentavos,
          precoProntuarioCentavos: planosSaas.precoProntuarioCentavos,
          permiteUnidadeExtra: planosSaas.permiteUnidadeExtra,
        })
        .from(tenants)
        .innerJoin(planosSaas, eq(planosSaas.id, tenants.planoId))
        .where(eq(tenants.id, id));
      if (!tenant) throw new ErroNegocio("Clínica não encontrada.");

      const listaUnidades = await tx.select().from(unidades).orderBy(asc(unidades.nome));
      const listaSalas = await tx.select().from(salas).orderBy(asc(salas.nome));
      const listaProfissionais = await tx.select().from(profissionais).orderBy(asc(profissionais.nome));
      const licencas = await tx.select().from(licencasProntuario);
      const mapaLicencas = new Map(licencas.map((l) => [l.profissionalId, l]));

      const profissionaisComProntuario = listaProfissionais.map((p) => {
        const lic = mapaLicencas.get(p.id);
        const estado = estadoLicencaProntuario(lic, agora);
        return {
          ...p,
          licencaProntuario: {
            ativo: lic?.ativo ?? false,
            estado,
            emTrial: estado === "teste",
            trialFimEm: lic?.trialFimEm ?? null,
            responsavel: lic?.responsavel ?? null,
            pagoAte: lic?.pagoAte ?? null,
          },
        };
      });

      const membros = await tx
        .select({
          id: memberships.id,
          role: memberships.role,
          ativo: memberships.ativo,
          criadoEm: memberships.criadoEm,
          userId: memberships.userId,
          userName: users.name,
          userEmail: users.email,
          userBanned: users.banned,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .orderBy(asc(users.name));

      const hoje = hojeNoFuso("America/Sao_Paulo", agora);
      const faturas = (await tx.select().from(faturasSaas).orderBy(desc(faturasSaas.competencia))).map((f) => ({
        ...f,
        status: statusParaExibir(f.status, f.vencimento, hoje),
      }));
      const faturasIds = faturas.map((f) => f.id);
      const itensFaturas = faturasIds.length > 0 ? await tx.select().from(faturasSaasItens).where(inArray(faturasSaasItens.faturaId, faturasIds)) : [];
      const itensPorFatura = itensFaturas.reduce(
        (acc, item) => {
          (acc[item.faturaId] ??= []).push(item);
          return acc;
        },
        {} as Record<string, typeof itensFaturas>,
      );

      return {
        tenant,
        recursos: { unidades: listaUnidades, salas: listaSalas, profissionais: profissionaisComProntuario },
        membros,
        faturas,
        itensPorFatura,
      };
    },
    database,
  );
}
