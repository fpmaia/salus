import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { convitesProfissional, memberships, profissionais } from "../db/schema";
import { type ContextoTenant, withTenant, withUser } from "../db/tenant";
import { analisarDocumento } from "../domain/documentos";
import { exigirPermissao } from "../domain/rbac";
import { exigirLimite } from "./assinatura";
import { ErroNegocio } from "./erros";

export const VALIDADE_CONVITE_DIAS = 7;

export const CONSELHOS = ["CRM", "CRP", "CREFITO", "CRN", "CRO", "COREN", "CRFa", "CREF", "Outro"] as const;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const profissionalSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido")),
  telefone: textoOpcional(30),
  conselho: z
    .enum(CONSELHOS)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  registro: textoOpcional(30),
  especialidade: textoOpcional(120),
  /** CPF ou CNPJ (tomador da NFS-e de locação). Opcional no cadastro, exigido para emitir nota. */
  documento: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return { tipoDocumento: null, documento: null };
      const doc = analisarDocumento(v);
      if (!doc) {
        ctx.addIssue({ code: "custom", message: "CPF ou CNPJ inválido" });
        return z.NEVER;
      }
      return { tipoDocumento: doc.tipo, documento: doc.digitos };
    }),
});

/** Achata o documento analisado nas colunas da tabela. */
function colunas(valores: z.output<typeof profissionalSchema>) {
  const { documento, ...resto } = valores;
  return { ...resto, ...documento };
}

function traduzirErroProfissional(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.violacaoUnica && pg.constraint === "profissionais_tenant_email_key") {
    throw new ErroNegocio("Já existe um profissional com esse e-mail");
  }
  throw erro;
}

export async function criarProfissional(
  ctx: ContextoTenant,
  dados: z.input<typeof profissionalSchema>,
  database?: Database,
): Promise<{ id: string }> {
  exigirPermissao(ctx.role, "profissionais.gerenciar");
  const valores = colunas(profissionalSchema.parse(dados));
  return withTenant(
    ctx,
    async (tx) => {
      await exigirLimite(tx, "profissionais");
      const [profissional] = await tx
        .insert(profissionais)
        .values(valores)
        .returning({ id: profissionais.id })
        .catch(traduzirErroProfissional);
      await registrarAuditoria(tx, {
        acao: "profissional.criado",
        entidade: "profissionais",
        entidadeId: profissional.id,
        dados: { nome: valores.nome, email: valores.email },
      });
      return profissional;
    },
    database,
  );
}

export async function atualizarProfissional(
  ctx: ContextoTenant,
  profissionalId: string,
  dados: z.input<typeof profissionalSchema> & { ativo: boolean },
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "profissionais.gerenciar");
  const valores = { ...colunas(profissionalSchema.parse(dados)), ativo: dados.ativo };
  await withTenant(
    ctx,
    async (tx) => {
      const [atual] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
      if (!atual) throw new ErroNegocio("Profissional não encontrado");
      if (valores.ativo && !atual.ativo) await exigirLimite(tx, "profissionais");
      // Depois do acesso criado, o e-mail é o do login e não muda por aqui.
      if (atual.membershipId && valores.email !== atual.email) {
        throw new ErroNegocio("O e-mail não pode ser alterado depois que o profissional aceitou o convite");
      }
      await tx.update(profissionais).set(valores).where(eq(profissionais.id, profissionalId)).catch(traduzirErroProfissional);
      // Desativar o profissional também tira o acesso dele ao espaço.
      if (atual.membershipId) {
        await tx.update(memberships).set({ ativo: valores.ativo }).where(eq(memberships.id, atual.membershipId));
      }
      await registrarAuditoria(tx, {
        acao: "profissional.atualizado",
        entidade: "profissionais",
        entidadeId: profissionalId,
        dados: valores,
      });
    },
    database,
  );
}

export type SituacaoAcesso = "ativo" | "convite_pendente" | "sem_acesso";

export async function listarProfissionais(ctx: ContextoTenant, agora = new Date(), database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const lista = await tx.select().from(profissionais).orderBy(asc(profissionais.nome));
      const pendentes = await tx
        .select({ profissionalId: convitesProfissional.profissionalId, expiraEm: convitesProfissional.expiraEm })
        .from(convitesProfissional)
        .where(
          and(
            isNull(convitesProfissional.aceitoEm),
            isNull(convitesProfissional.revogadoEm),
            gt(convitesProfissional.expiraEm, agora),
          ),
        )
        .orderBy(desc(convitesProfissional.expiraEm));
      const convitePorProfissional = new Map<string, Date>();
      for (const c of pendentes) {
        if (!convitePorProfissional.has(c.profissionalId)) convitePorProfissional.set(c.profissionalId, c.expiraEm);
      }
      return lista.map((p) => {
        const conviteExpiraEm = convitePorProfissional.get(p.id) ?? null;
        const situacao: SituacaoAcesso = p.membershipId ? "ativo" : conviteExpiraEm ? "convite_pendente" : "sem_acesso";
        return { ...p, situacao, conviteExpiraEm };
      });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Convites
// ---------------------------------------------------------------------------

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Gera um convite novo (revogando os pendentes) e devolve o token em claro.
 * O token só existe neste retorno: no banco fica apenas o hash.
 */
export async function gerarConvite(
  ctx: ContextoTenant,
  profissionalId: string,
  agora = new Date(),
  database?: Database,
): Promise<{ token: string; expiraEm: Date }> {
  exigirPermissao(ctx.role, "profissionais.gerenciar");
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(agora.getTime() + VALIDADE_CONVITE_DIAS * 86_400_000);

  await withTenant(
    ctx,
    async (tx) => {
      const [profissional] = await tx.select().from(profissionais).where(eq(profissionais.id, profissionalId));
      if (!profissional) throw new ErroNegocio("Profissional não encontrado");
      if (profissional.membershipId) throw new ErroNegocio("Este profissional já tem acesso ao espaço");
      if (!profissional.ativo) throw new ErroNegocio("Reative o profissional antes de convidá-lo");

      await tx
        .update(convitesProfissional)
        .set({ revogadoEm: agora })
        .where(
          and(
            eq(convitesProfissional.profissionalId, profissionalId),
            isNull(convitesProfissional.aceitoEm),
            isNull(convitesProfissional.revogadoEm),
          ),
        );
      const [convite] = await tx
        .insert(convitesProfissional)
        .values({ profissionalId, tokenHash: hashToken(token), expiraEm })
        .returning({ id: convitesProfissional.id });
      await registrarAuditoria(tx, {
        acao: "convite.gerado",
        entidade: "profissionais",
        entidadeId: profissionalId,
        dados: { conviteId: convite.id, expiraEm: expiraEm.toISOString() },
      });
    },
    database,
  );
  return { token, expiraEm };
}

export type SituacaoConvite = "valido" | "expirado" | "aceito" | "revogado";

export type ConvitePublico = {
  tenantNome: string;
  profissionalNome: string;
  email: string;
  situacao: SituacaoConvite;
};

/** Dados do convite para a página pública do link (sem login, sem tenant no contexto). */
export async function obterConvite(token: string, database: Database = getDb()): Promise<ConvitePublico | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const { rows } = await database.execute<{
    tenant_nome: string;
    profissional_nome: string;
    email: string;
    situacao: SituacaoConvite;
  }>(sql`select * from app_convite_por_token(${hashToken(token)})`);
  const [linha] = rows;
  if (!linha) return null;
  return {
    tenantNome: linha.tenant_nome,
    profissionalNome: linha.profissional_nome,
    email: linha.email,
    situacao: linha.situacao,
  };
}

const MENSAGENS_CONVITE: Record<string, string> = {
  "convite.sem_usuario": "Entre na sua conta para aceitar o convite",
  "convite.invalido": "Convite inválido ou revogado",
  "convite.ja_aceito": "Este convite já foi aceito",
  "convite.expirado": "Este convite expirou. Peça um novo link ao espaço",
  "convite.email_divergente": "Entre com o mesmo e-mail para o qual o convite foi enviado",
  "convite.usuario_com_espaco": "Sua conta já participa de outro espaço",
};

/** Aceita o convite para o usuário logado; devolve o tenant em que ele passou a atuar. */
export async function aceitarConvite(
  userId: string,
  token: string,
  database?: Database,
): Promise<{ tenantId: string }> {
  try {
    return await withUser(
      userId,
      async (tx) => {
        const { rows } = await tx.execute<{ tenant_id: string }>(
          sql`select app_aceitar_convite(${hashToken(token)}) as tenant_id`,
        );
        return { tenantId: rows[0].tenant_id };
      },
      database,
    );
  } catch (erro) {
    const pg = erroPostgres(erro);
    const mensagem = pg?.code === PG.excecaoPlpgsql ? MENSAGENS_CONVITE[pg.message] : undefined;
    if (mensagem) throw new ErroNegocio(mensagem);
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Profissional do usuário logado
// ---------------------------------------------------------------------------

/** Cadastro de profissional vinculado ao usuário do contexto (null se não houver). */
export async function profissionalDoUsuario(tx: Transaction, userId: string) {
  const [linha] = await tx
    .select({ id: profissionais.id, nome: profissionais.nome, ativo: profissionais.ativo })
    .from(profissionais)
    .innerJoin(memberships, eq(memberships.id, profissionais.membershipId))
    .where(eq(memberships.userId, userId));
  return linha ?? null;
}
