import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { convitesMembro, memberships, users } from "../db/schema";
import { type ContextoTenant, withTenant, withUser } from "../db/tenant";
import { exigirPermissao, ROLES, type Role } from "../domain/rbac";
import { ErroNegocio } from "./erros";

export const VALIDADE_CONVITE_MEMBRO_DIAS = 7;

export function hashTokenMembro(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type MembroClinica = {
  membershipId: string;
  userId: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  criadoEm: Date;
};

export type ConviteMembroPendente = {
  id: string;
  email: string;
  role: Role;
  profissionalId: string | null;
  expiraEm: Date;
  criadoEm: Date;
};

/** Lista todos os membros da clínica atual com informações de usuário. */
export async function listarMembrosDaClinica(
  ctx: ContextoTenant,
  database?: Database,
): Promise<MembroClinica[]> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  return withTenant(
    ctx,
    async (tx) => {
      const linhas = await tx
        .select({
          membershipId: memberships.id,
          userId: users.id,
          nome: users.name,
          email: users.email,
          role: memberships.role,
          ativo: memberships.ativo,
          criadoEm: memberships.criadoEm,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.tenantId, ctx.tenantId))
        .orderBy(desc(memberships.criadoEm));

      return linhas.map((l) => ({
        ...l,
        role: l.role as Role,
      }));
    },
    database,
  );
}

/** Lista convites pendentes e não expirados para a clínica atual. */
export async function listarConvitesPendentes(
  ctx: ContextoTenant,
  agora = new Date(),
  database?: Database,
): Promise<ConviteMembroPendente[]> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  return withTenant(
    ctx,
    async (tx) => {
      const linhas = await tx
        .select({
          id: convitesMembro.id,
          email: convitesMembro.email,
          role: convitesMembro.role,
          profissionalId: convitesMembro.profissionalId,
          expiraEm: convitesMembro.expiraEm,
          criadoEm: convitesMembro.criadoEm,
        })
        .from(convitesMembro)
        .where(
          and(
            eq(convitesMembro.tenantId, ctx.tenantId),
            isNull(convitesMembro.aceitoEm),
            isNull(convitesMembro.revogadoEm),
            gt(convitesMembro.expiraEm, agora),
          ),
        )
        .orderBy(desc(convitesMembro.criadoEm));

      return linhas.map((l) => ({
        ...l,
        role: l.role as Role,
      }));
    },
    database,
  );
}

const ConvidarMembroSchema = z.object({
  email: z.string().trim().email("E-mail inválido").toLowerCase(),
  role: z.enum(ROLES, { message: "Papel inválido" }),
  profissionalId: z.string().uuid("ID de profissional inválido").nullable().optional(),
});

export type ConvidarMembroInput = z.infer<typeof ConvidarMembroSchema>;

/**
 * Cria ou renova convite para membro da equipe.
 * Devolve o token em claro (mostrado uma única vez).
 */
export async function convidarMembro(
  ctx: ContextoTenant,
  dadosBrutos: ConvidarMembroInput,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string; token: string; expiraEm: Date; link: string }> {
  exigirPermissao(ctx.role, "membros.gerenciar");
  const dados = ConvidarMembroSchema.parse(dadosBrutos);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashTokenMembro(token);
  const expiraEm = new Date(agora.getTime() + VALIDADE_CONVITE_MEMBRO_DIAS * 86_400_000);

  const convite = await withTenant(
    ctx,
    async (tx) => {
      // Revoga convites pendentes anteriores para o mesmo e-mail neste tenant
      await tx
        .update(convitesMembro)
        .set({ revogadoEm: agora })
        .where(
          and(
            eq(convitesMembro.tenantId, ctx.tenantId),
            eq(convitesMembro.email, dados.email),
            isNull(convitesMembro.aceitoEm),
            isNull(convitesMembro.revogadoEm),
          ),
        );

      const [novoConvite] = await tx
        .insert(convitesMembro)
        .values({
          tenantId: ctx.tenantId,
          email: dados.email,
          role: dados.role,
          profissionalId: dados.profissionalId ?? null,
          tokenHash,
          expiraEm,
        })
        .returning({ id: convitesMembro.id });

      await registrarAuditoria(tx, {
        acao: "membro.convidado",
        entidade: "convites_membro",
        entidadeId: novoConvite.id,
        dados: { email: dados.email, role: dados.role, expiraEm: expiraEm.toISOString() },
      });

      return novoConvite;
    },
    database,
  );

  return {
    id: convite.id,
    token,
    expiraEm,
    link: `/convite-equipe/${token}`,
  };
}

/** Revoga um convite pendente. */
export async function revogarConvite(
  ctx: ContextoTenant,
  conviteId: string,
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  await withTenant(
    ctx,
    async (tx) => {
      const [convite] = await tx
        .select()
        .from(convitesMembro)
        .where(and(eq(convitesMembro.id, conviteId), eq(convitesMembro.tenantId, ctx.tenantId)));

      if (!convite) throw new ErroNegocio("Convite não encontrado");
      if (convite.aceitoEm) throw new ErroNegocio("Convite já foi aceito e não pode ser revogado");

      await tx
        .update(convitesMembro)
        .set({ revogadoEm: new Date() })
        .where(eq(convitesMembro.id, conviteId));

      await registrarAuditoria(tx, {
        acao: "convite.revogado",
        entidade: "convites_membro",
        entidadeId: conviteId,
        dados: { email: convite.email },
      });
    },
    database,
  );
}

/** Altera o papel de um membro da clínica, garantindo ao menos um admin ativo. */
export async function alterarPapelMembro(
  ctx: ContextoTenant,
  membershipId: string,
  novoRole: Role,
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  await withTenant(
    ctx,
    async (tx) => {
      const [membro] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));

      if (!membro) throw new ErroNegocio("Membro não encontrado");
      if (membro.role === novoRole) return;

      // Se o membro for admin e estiver mudando para outro papel, verificar se há outros admins ativos
      if (membro.role === "admin" && novoRole !== "admin") {
        const outrosAdmins = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.tenantId, ctx.tenantId),
              eq(memberships.role, "admin"),
              eq(memberships.ativo, true),
              sql`${memberships.id} <> ${membershipId}`,
            ),
          );

        if (outrosAdmins.length === 0) {
          throw new ErroNegocio("A clínica precisa ter pelo menos um administrador ativo.");
        }
      }

      await tx
        .update(memberships)
        .set({ role: novoRole, atualizadoEm: new Date() })
        .where(eq(memberships.id, membershipId));

      // Quem vira profissional ganha o cadastro (agenda, extrato, licença do prontuário).
      if (novoRole === "profissional") {
        await tx.execute(sql`select app_garantir_profissional_do_membro(${membershipId})`);
      }

      await registrarAuditoria(tx, {
        acao: "membro.papel_alterado",
        entidade: "memberships",
        entidadeId: membershipId,
        dados: { roleAnterior: membro.role, novoRole },
      });
    },
    database,
  );
}

/** Desativa um membro da clínica, garantindo que o último admin não seja desativado. */
export async function desativarMembro(
  ctx: ContextoTenant,
  membershipId: string,
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  await withTenant(
    ctx,
    async (tx) => {
      const [membro] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));

      if (!membro) throw new ErroNegocio("Membro não encontrado");
      if (!membro.ativo) return;

      // Se for admin, não pode desativar se for o último
      if (membro.role === "admin") {
        const outrosAdmins = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.tenantId, ctx.tenantId),
              eq(memberships.role, "admin"),
              eq(memberships.ativo, true),
              sql`${memberships.id} <> ${membershipId}`,
            ),
          );

        if (outrosAdmins.length === 0) {
          throw new ErroNegocio("Não é possível desativar o único administrador da clínica.");
        }
      }

      await tx
        .update(memberships)
        .set({ ativo: false, atualizadoEm: new Date() })
        .where(eq(memberships.id, membershipId));

      await registrarAuditoria(tx, {
        acao: "membro.desativado",
        entidade: "memberships",
        entidadeId: membershipId,
        dados: { role: membro.role },
      });
    },
    database,
  );
}

/** Reativa um membro previamente desativado. */
export async function reativarMembro(
  ctx: ContextoTenant,
  membershipId: string,
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "membros.gerenciar");

  await withTenant(
    ctx,
    async (tx) => {
      const [membro] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)));

      if (!membro) throw new ErroNegocio("Membro não encontrado");
      if (membro.ativo) return;

      await tx
        .update(memberships)
        .set({ ativo: true, atualizadoEm: new Date() })
        .where(eq(memberships.id, membershipId));

      await registrarAuditoria(tx, {
        acao: "membro.reativado",
        entidade: "memberships",
        entidadeId: membershipId,
        dados: { role: membro.role },
      });
    },
    database,
  );
}

export type ConviteMembroPublico = {
  id: string;
  tenantId: string;
  tenantNome: string;
  email: string;
  role: Role;
  expiraEm: Date;
  aceitoEm: Date | null;
  revogadoEm: Date | null;
  valido: boolean;
};

/** Busca dados públicos de um convite para exibir na página de aceite. */
export async function obterConviteMembroPublico(
  token: string,
  database: Database = getDb(),
): Promise<ConviteMembroPublico | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;

  const { rows } = await database.execute<{
    id: string;
    tenant_id: string;
    tenant_nome: string;
    email: string;
    role: Role;
    expira_em: string;
    aceito_em: string | null;
    revogado_em: string | null;
  }>(sql`select * from app_convite_membro_por_token(${hashTokenMembro(token)})`);

  const [linha] = rows;
  if (!linha) return null;

  const agora = new Date();
  const expiraEm = new Date(linha.expira_em);
  const aceitoEm = linha.aceito_em ? new Date(linha.aceito_em) : null;
  const revogadoEm = linha.revogado_em ? new Date(linha.revogado_em) : null;
  const valido = !aceitoEm && !revogadoEm && expiraEm > agora;

  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    tenantNome: linha.tenant_nome,
    email: linha.email,
    role: linha.role,
    expiraEm,
    aceitoEm,
    revogadoEm,
    valido,
  };
}

const MENSAGENS_CONVITE_MEMBRO: Record<string, string> = {
  "convite.sem_usuario": "Entre na sua conta para aceitar o convite.",
  "convite.invalido": "Convite inválido ou revogado.",
  "convite.ja_aceito": "Este convite já foi aceito.",
  "convite.expirado": "Este convite expirou. Peça um novo convite ao administrador.",
  "convite.email_divergente": "Você precisa estar conectado com o mesmo e-mail para o qual o convite foi enviado.",
};

/** Aceita o convite de equipe para o usuário logado via withUser. */
export async function aceitarConviteMembro(
  userId: string,
  token: string,
  database?: Database,
): Promise<{ tenantId: string }> {
  try {
    return await withUser(
      userId,
      async (tx) => {
        const { rows } = await tx.execute<{ tenant_id: string }>(
          sql`select app_aceitar_convite_membro(${hashTokenMembro(token)}) as tenant_id`,
        );
        return { tenantId: rows[0].tenant_id };
      },
      database,
    );
  } catch (erro) {
    const pg = erroPostgres(erro);
    const mensagem = pg?.code === PG.excecaoPlpgsql ? MENSAGENS_CONVITE_MEMBRO[pg.message] : undefined;
    if (mensagem) throw new ErroNegocio(mensagem);
    throw erro;
  }
}
