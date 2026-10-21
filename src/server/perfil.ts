import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { memberships, profissionais, sessions, users } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { gerarSlug } from "../domain/disponibilidade";
import { urlPublica } from "./links";
import { ErroNegocio } from "./erros";

export const perfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo"),
  telefone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || null),
});

export const dadosProfissionaisSchema = z.object({
  conselho: z.string().trim().max(30).optional().transform((v) => v || null),
  registro: z.string().trim().max(30).optional().transform((v) => v || null),
  especialidade: z.string().trim().max(100).optional().transform((v) => v || null),
  mensagemPublica: z.string().trim().max(500).optional().transform((v) => v || null),
  duracaoConsultaMin: z.coerce.number().int().min(15).max(480).default(60),
  agendamentoOnline: z.boolean().default(false),
  slugPublico: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, "O link deve conter apenas letras minúsculas, números e hífens (3 a 60 caracteres)")
    .optional()
    .transform((v) => v || null),
});

async function profissionalCompletoDoUsuario(tx: Transaction, userId: string) {
  const [linha] = await tx
    .select({
      id: profissionais.id,
      nome: profissionais.nome,
      telefone: profissionais.telefone,
      conselho: profissionais.conselho,
      registro: profissionais.registro,
      especialidade: profissionais.especialidade,
      agendamentoOnline: profissionais.agendamentoOnline,
      slugPublico: profissionais.slugPublico,
      duracaoConsultaMin: profissionais.duracaoConsultaMin,
      mensagemPublica: profissionais.mensagemPublica,
      ativo: profissionais.ativo,
    })
    .from(profissionais)
    .innerJoin(memberships, eq(memberships.id, profissionais.membershipId))
    .where(eq(memberships.userId, userId));
  return linha ?? null;
}

export async function obterPerfil(ctx: ContextoTenant, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const [u] = await tx
        .select({ id: users.id, name: users.name, email: users.email, image: users.image })
        .from(users)
        .where(eq(users.id, ctx.userId));

      const prof = await profissionalCompletoDoUsuario(tx, ctx.userId);

      const linkAgendamento = prof?.slugPublico ? `${urlPublica()}/agendar/${prof.slugPublico}` : null;

      return {
        usuario: {
          id: u?.id ?? ctx.userId,
          nome: u?.name ?? "",
          email: u?.email ?? "",
          role: ctx.role,
        },
        profissional: prof
          ? {
              id: prof.id,
              nome: prof.nome,
              telefone: prof.telefone,
              conselho: prof.conselho,
              registro: prof.registro,
              especialidade: prof.especialidade,
              agendamentoOnline: prof.agendamentoOnline,
              slugPublico: prof.slugPublico,
              duracaoConsultaMin: prof.duracaoConsultaMin,
              mensagemPublica: prof.mensagemPublica,
              linkAgendamento,
            }
          : null,
      };
    },
    database,
  );
}

export async function atualizarDadosPessoais(
  ctx: ContextoTenant,
  dados: z.input<typeof perfilSchema>,
  database?: Database,
) {
  const p = perfilSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      await tx
        .update(users)
        .set({ name: p.nome })
        .where(eq(users.id, ctx.userId));

      const prof = await profissionalCompletoDoUsuario(tx, ctx.userId);
      if (prof) {
        await tx
          .update(profissionais)
          .set({ nome: p.nome, telefone: p.telefone })
          .where(eq(profissionais.id, prof.id));
      }

      await registrarAuditoria(tx, {
        acao: "usuario.perfil_atualizado",
        entidade: "users",
        entidadeId: ctx.userId,
        dados: p,
      });

      return { sucesso: true };
    },
    database,
  );
}

export async function atualizarDadosProfissionais(
  ctx: ContextoTenant,
  dados: z.input<typeof dadosProfissionaisSchema>,
  database?: Database,
) {
  const dp = dadosProfissionaisSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const prof = await profissionalCompletoDoUsuario(tx, ctx.userId);
      if (!prof) throw new ErroNegocio("Você não possui um cadastro profissional vinculado");

      let slug = dp.slugPublico;
      if (dp.agendamentoOnline && !slug) {
        slug = prof.slugPublico ?? gerarSlug(prof.nome, crypto.randomUUID().slice(0, 6));
      }

      await tx
        .update(profissionais)
        .set({
          conselho: dp.conselho,
          registro: dp.registro,
          especialidade: dp.especialidade,
          mensagemPublica: dp.mensagemPublica,
          duracaoConsultaMin: dp.duracaoConsultaMin,
          agendamentoOnline: dp.agendamentoOnline,
          slugPublico: slug,
        })
        .where(eq(profissionais.id, prof.id));

      await registrarAuditoria(tx, {
        acao: "profissional.perfil_atualizado",
        entidade: "profissionais",
        entidadeId: prof.id,
        dados: { ...dp, slugPublico: slug },
      });

      return { sucesso: true, slug };
    },
    database,
  );
}

export type SessaoAtiva = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  ehAtual: boolean;
};

export async function listarSessoesAtivas(
  userId: string,
  tokenAtual?: string | null,
  database: Database = getDb(),
): Promise<SessaoAtiva[]> {
  const agora = new Date();
  const linhas = await database
    .select({
      id: sessions.id,
      token: sessions.token,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, agora)))
    .orderBy(desc(sessions.createdAt));

  return linhas.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    ehAtual: Boolean(tokenAtual && s.token === tokenAtual),
  }));
}

export async function revogarSessaoUsuario(
  userId: string,
  sessionId: string,
  database: Database = getDb(),
): Promise<void> {
  await database
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
}

export async function revogarOutrasSessoesUsuario(
  userId: string,
  tokenAtual: string,
  database: Database = getDb(),
): Promise<void> {
  await database
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), sql`${sessions.token} <> ${tokenAtual}`));
}

