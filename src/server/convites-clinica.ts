import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database, type Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { withUser } from "../db/tenant";
import { ErroNegocio } from "./erros";
import { exigirAcessoPlataforma, exigirSuperadmin } from "./plataforma";

// Convite trial: a equipe Salus libera para uma clínica nova um período de teste grátis num
// plano. A pessoa convidada cria a conta com o e-mail do convite e cadastra o espaço pelo link;
// o espaço nasce no plano do convite, sem fatura até o fim do teste (regra em domain/cobranca).

export const VALIDADE_PADRAO_CONVITE_CLINICA_DIAS = 14;

export function hashTokenClinica(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenClinicaValido(token: string): boolean {
  return /^[\w-]{20,100}$/.test(token);
}

const MENSAGENS: Record<string, string> = {
  "convite_clinica.plano_invalido": "Escolha um plano ativo",
  "convite_clinica.nao_pendente": "Este convite já foi usado ou revogado",
  "convite_clinica.invalido": "Convite de teste inválido ou revogado",
  "convite_clinica.usado": "Este convite de teste já foi usado",
  "convite_clinica.expirado": "Este convite de teste expirou. Peça um novo à equipe Salus",
  "convite_clinica.email_divergente": "Entre com o mesmo e-mail para o qual o convite foi enviado",
  "clinica.nao_encontrada": "Clínica não encontrada",
};

function traduzir(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.excecaoPlpgsql && MENSAGENS[pg.message]) throw new ErroNegocio(MENSAGENS[pg.message]);
  throw erro;
}

export const conviteClinicaSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  planoId: z.uuid("Escolha o plano"),
  diasTeste: z.coerce.number().int("Dias inteiros").min(1, "Mínimo de 1 dia").max(365, "Máximo de 365 dias"),
  validadeDias: z.coerce.number().int().min(1, "O link vale no mínimo 1 dia").max(90, "O link vale no máximo 90 dias").default(VALIDADE_PADRAO_CONVITE_CLINICA_DIAS),
  observacao: z.string().trim().max(300, "Observação até 300 caracteres").default(""),
});

/** Cria o convite (substitui um pendente do mesmo e-mail). O token só existe aqui, em claro. */
export async function criarConviteClinica(
  userId: string,
  dados: z.input<typeof conviteClinicaSchema>,
  agora = new Date(),
  database?: Database,
): Promise<{ id: string; token: string; link: string; expiraEm: Date }> {
  await exigirAcessoPlataforma(userId, "convites.gerenciar", database);
  const d = conviteClinicaSchema.parse(dados);
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(agora.getTime() + d.validadeDias * 86_400_000);
  const id = await withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(
          sql`select app_plataforma_criar_convite_clinica(${d.email}, ${d.planoId}, ${d.diasTeste}, ${expiraEm.toISOString()}, ${hashTokenClinica(token)}, ${d.observacao}) as id`,
        )
        .catch(traduzir);
      return rows[0].id;
    },
    database,
  );
  return { id, token, link: `/teste/${token}`, expiraEm };
}

export type SituacaoConviteClinica = "pendente" | "usado" | "expirado" | "revogado";

export function situacaoDoConvite(c: { usadoEm: Date | null; revogadoEm: Date | null; expiraEm: Date }, agora = new Date()): SituacaoConviteClinica {
  if (c.usadoEm) return "usado";
  if (c.revogadoEm) return "revogado";
  return c.expiraEm <= agora ? "expirado" : "pendente";
}

export async function listarConvitesClinica(userId: string, database?: Database, agora = new Date()) {
  await exigirSuperadmin(userId, database);
  const { rows } = await withUser(
    userId,
    (tx) =>
      tx.execute<{
        id: string;
        email: string;
        plano_nome: string;
        dias_teste: number;
        observacao: string | null;
        expira_em: string;
        criado_em: string;
        criado_por_nome: string | null;
        usado_em: string | null;
        revogado_em: string | null;
        tenant_id: string | null;
        tenant_nome: string | null;
        teste_ate: string | null;
      }>(sql`select * from app_plataforma_convites_clinica(200)`),
    database,
  );
  return rows.map((r) => {
    const c = {
      id: r.id,
      email: r.email,
      planoNome: r.plano_nome,
      diasTeste: r.dias_teste,
      observacao: r.observacao,
      expiraEm: new Date(r.expira_em),
      criadoEm: new Date(r.criado_em),
      criadoPorNome: r.criado_por_nome,
      usadoEm: r.usado_em ? new Date(r.usado_em) : null,
      revogadoEm: r.revogado_em ? new Date(r.revogado_em) : null,
      tenantId: r.tenant_id,
      tenantNome: r.tenant_nome,
      testeAte: r.teste_ate,
    };
    return { ...c, situacao: situacaoDoConvite(c, agora) };
  });
}

export async function revogarConviteClinica(userId: string, conviteId: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "convites.gerenciar", database);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_revogar_convite_clinica(${z.uuid().parse(conviteId)})`).catch(traduzir), database);
}

/** Estende ou encerra o teste de uma clínica (data no passado encerra; null tira o teste). */
export async function definirFimDoTeste(userId: string, tenantId: string, testeAte: string | null, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const data = testeAte === null ? null : z.iso.date("Data inválida").parse(testeAte);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_definir_fim_teste(${tenantId}, ${data}::date)`).catch(traduzir), database);
}

export type ConviteClinicaPublico = {
  email: string;
  planoNome: string;
  diasTeste: number;
  expiraEm: Date;
  situacao: SituacaoConviteClinica;
};

/** Dados do convite para a página do link (sem sessão). */
export async function obterConviteClinicaPublico(token: string, database: Database = getDb(), agora = new Date()): Promise<ConviteClinicaPublico | null> {
  if (!tokenClinicaValido(token)) return null;
  const { rows } = await database.execute<{
    email: string;
    plano_nome: string;
    dias_teste: number;
    expira_em: string;
    usado_em: string | null;
    revogado_em: string | null;
  }>(sql`select * from app_convite_clinica_por_token(${hashTokenClinica(token)})`);
  const [r] = rows;
  if (!r) return null;
  const expiraEm = new Date(r.expira_em);
  return {
    email: r.email,
    planoNome: r.plano_nome,
    diasTeste: r.dias_teste,
    expiraEm,
    situacao: situacaoDoConvite({ usadoEm: r.usado_em ? new Date(r.usado_em) : null, revogadoEm: r.revogado_em ? new Date(r.revogado_em) : null, expiraEm }, agora),
  };
}

/** Na criação do espaço (mesma transação): aplica o plano e o fim do teste do convite. */
export async function usarConviteClinica(tx: Transaction, token: string): Promise<string> {
  if (!tokenClinicaValido(token)) throw new ErroNegocio(MENSAGENS["convite_clinica.invalido"]);
  const { rows } = await tx
    .execute<{ teste_ate: string }>(sql`select app_usar_convite_clinica(${hashTokenClinica(token)}) as teste_ate`)
    .catch(traduzir);
  return rows[0].teste_ate;
}
