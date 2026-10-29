import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { withUser } from "../db/tenant";
import { PAPEIS_PLATAFORMA, type PapelPlataforma } from "../domain/permissoes-plataforma";
import { ErroNegocio } from "./erros";
import { exigirAcessoPlataforma } from "./plataforma";

// Equipe Salus: o dono convida por e-mail; quem entra com aquele e-mail (verificado) aceita em
// /plataforma. Papéis e regras no banco (migration 0046); a equipe nunca fica sem dono.

export const VALIDADE_CONVITE_EQUIPE_DIAS = 7;

const MENSAGENS: Record<string, string> = {
  "equipe.ja_membro": "Esta pessoa já está na equipe da plataforma",
  "equipe.convite_nao_pendente": "Este convite já foi aceito ou revogado",
  "equipe.convite_invalido": "Convite inválido, expirado ou para outro e-mail",
  "equipe.nao_membro": "Esta pessoa não está na equipe da plataforma",
  "equipe.ultimo_dono": "A equipe precisa de ao menos um Dono",
};

function traduzir(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.excecaoPlpgsql && MENSAGENS[pg.message]) throw new ErroNegocio(MENSAGENS[pg.message]);
  throw erro;
}

const papelSchema = z.enum(PAPEIS_PLATAFORMA, { error: "Escolha o papel" });

export type MembroEquipePlataforma = {
  userId: string;
  nome: string;
  email: string;
  papel: PapelPlataforma;
  doisFatores: boolean;
  banido: boolean;
  desde: Date;
};

export type ConviteEquipePlataforma = {
  id: string;
  email: string;
  papel: PapelPlataforma;
  expiraEm: Date;
  criadoEm: Date;
  criadoPorNome: string | null;
};

export async function listarEquipePlataforma(userId: string, database?: Database): Promise<MembroEquipePlataforma[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        user_id: string;
        nome: string;
        email: string;
        papel: PapelPlataforma;
        dois_fatores: boolean;
        banido: boolean;
        desde: string;
      }>(sql`select * from app_plataforma_equipe()`);
      return rows.map((r) => ({
        userId: r.user_id,
        nome: r.nome,
        email: r.email,
        papel: r.papel,
        doisFatores: r.dois_fatores,
        banido: r.banido,
        desde: new Date(r.desde),
      }));
    },
    database,
  );
}

export async function listarConvitesEquipePlataforma(userId: string, database?: Database): Promise<ConviteEquipePlataforma[]> {
  await exigirAcessoPlataforma(userId, "equipe.gerenciar", database);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        email: string;
        papel: PapelPlataforma;
        expira_em: string;
        criado_em: string;
        criado_por_nome: string | null;
      }>(sql`select * from app_plataforma_convites_equipe()`);
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        papel: r.papel,
        expiraEm: new Date(r.expira_em),
        criadoEm: new Date(r.criado_em),
        criadoPorNome: r.criado_por_nome,
      }));
    },
    database,
  );
}

export const conviteEquipeSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  papel: papelSchema,
});

export async function convidarParaEquipePlataforma(
  userId: string,
  dados: { email: string; papel: string },
  agora = new Date(),
  database?: Database,
): Promise<{ id: string; email: string; papel: PapelPlataforma; expiraEm: Date }> {
  await exigirAcessoPlataforma(userId, "equipe.gerenciar", database);
  const d = conviteEquipeSchema.parse(dados);
  const expiraEm = new Date(agora.getTime() + VALIDADE_CONVITE_EQUIPE_DIAS * 86_400_000);
  const id = await withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(sql`select app_plataforma_convidar_equipe(${d.email}, ${d.papel}, ${expiraEm.toISOString()}) as id`)
        .catch(traduzir);
      return rows[0].id;
    },
    database,
  );
  return { id, email: d.email, papel: d.papel, expiraEm };
}

export async function revogarConviteEquipePlataforma(userId: string, conviteId: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "equipe.gerenciar", database);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_revogar_convite_equipe(${z.uuid().parse(conviteId)})`).catch(traduzir), database);
}

export async function definirPapelPlataforma(userId: string, alvoId: string, papel: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "equipe.gerenciar", database);
  const p = papelSchema.parse(papel);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_definir_papel(${z.uuid().parse(alvoId)}, ${p})`).catch(traduzir), database);
}

export async function removerDaEquipePlataforma(userId: string, alvoId: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "equipe.gerenciar", database);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_remover_da_equipe(${z.uuid().parse(alvoId)})`).catch(traduzir), database);
}

/** Convite pendente para o e-mail (verificado) de quem está logado; sem permissão de plataforma. */
export async function conviteEquipePendenteDoUsuario(
  userId: string,
  database?: Database,
): Promise<{ id: string; papel: PapelPlataforma; convidadoPor: string | null } | null> {
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ id: string; papel: PapelPlataforma; convidado_por: string | null }>(
        sql`select * from app_convite_equipe_plataforma_pendente()`,
      );
      const r = rows[0];
      return r ? { id: r.id, papel: r.papel, convidadoPor: r.convidado_por } : null;
    },
    database,
  );
}

export async function aceitarConviteEquipePlataforma(userId: string, conviteId: string, database?: Database): Promise<PapelPlataforma> {
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ papel: PapelPlataforma }>(sql`select app_aceitar_convite_equipe_plataforma(${z.uuid().parse(conviteId)}) as papel`)
        .catch(traduzir);
      return rows[0].papel;
    },
    database,
  );
}
