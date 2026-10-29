import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "../db/client";
import { faturasSaas, planosSaas, tenants } from "../db/schema";
import { withSistema, withUser } from "../db/tenant";
import { competenciaDe } from "../domain/financeiro";
import { primeiraCompetenciaCobrada } from "../domain/cobranca";
import { hojeNoFuso } from "../domain/tempo";
import { ErroGateway, gatewayDaPlataforma, type GatewayCobranca } from "./asaas";
import { previaDaFatura } from "./assinatura";
import { ErroNegocio } from "./erros";
import { exigirAcessoPlataforma } from "./plataforma";
import { traduzirErroFinanceiro } from "./plataforma-financeiro";

// Gestão da conta de uma clínica pela equipe Salus: cancelar a conta, notas internas, encerrar
// sessões, histórico e prévia da troca de plano. Grava pelas funções da migration 0050.

/** Cancela a conta (só Dono): exige digitar o nome da clínica; cancela as cobranças em aberto no Asaas. */
export async function cancelarContaClinica(
  userId: string,
  tenantId: string,
  dados: { confirmacao: string; motivo: string },
  opcoes: { gateway?: GatewayCobranca; database?: Database } = {},
): Promise<{ faturasCanceladas: number }> {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "clinicas.cancelar", database);
  const id = z.uuid().parse(tenantId);
  const motivo = z.string().trim().min(3, "Informe o motivo do cancelamento").max(300).parse(dados.motivo);
  const { nome, abertas } = await withSistema(
    id,
    async (tx) => ({
      nome: (await tx.select({ nome: tenants.nome }).from(tenants))[0]?.nome,
      abertas: await tx.select().from(faturasSaas).where(inArray(faturasSaas.status, ["pendente", "vencida"])),
    }),
    database,
  );
  if (!nome) throw new ErroNegocio("Clínica não encontrada");
  if (dados.confirmacao.trim().toLowerCase() !== nome.trim().toLowerCase()) throw new ErroNegocio("Digite o nome da clínica exatamente como aparece para confirmar");

  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  for (const f of abertas) {
    if (!f.asaasPaymentId) continue;
    try {
      await gateway.cancelarCobranca(f.asaasPaymentId);
    } catch (erro) {
      if (erro instanceof ErroGateway) throw new ErroNegocio(`O Asaas recusou cancelar a fatura de ${f.vencimento}: ${erro.message}`);
      throw erro;
    }
  }
  const { rows } = await withUser(
    userId,
    (tx) => tx.execute<{ qtd: number }>(sql`select app_plataforma_cancelar_clinica(${id}, ${motivo}) as qtd`).catch(traduzirErroFinanceiro),
    database,
  );
  return { faturasCanceladas: Number(rows[0].qtd) };
}

export type NotaClinica = { id: string; texto: string; autorNome: string | null; criadoEm: Date };

export async function listarNotasClinica(userId: string, tenantId: string, database?: Database): Promise<NotaClinica[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ id: string; texto: string; autor_nome: string | null; criado_em: string }>(
        sql`select * from app_plataforma_notas(${z.uuid().parse(tenantId)})`,
      );
      return rows.map((r) => ({ id: r.id, texto: r.texto, autorNome: r.autor_nome, criadoEm: new Date(r.criado_em) }));
    },
    database,
  );
}

export async function criarNotaClinica(userId: string, tenantId: string, texto: string, database?: Database): Promise<void> {
  await exigirAcessoPlataforma(userId, "ver", database);
  const t = z.string().trim().min(2, "Escreva a nota").max(2000, "Nota até 2000 caracteres").parse(texto);
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_criar_nota(${z.uuid().parse(tenantId)}, ${t})`).catch(traduzirErroFinanceiro), database);
}

/** Encerra as sessões de um usuário (ele precisa entrar de novo em todos os aparelhos). */
export async function encerrarSessoesUsuario(userId: string, alvoId: string, database?: Database): Promise<number> {
  await exigirAcessoPlataforma(userId, "clinicas.gerenciar", database);
  const { rows } = await withUser(userId, (tx) => tx.execute<{ qtd: number }>(sql`select app_plataforma_encerrar_sessoes(${z.uuid().parse(alvoId)}) as qtd`), database);
  return Number(rows[0].qtd);
}

export type EventoHistorico = { origem: "plataforma" | "espaco"; acao: string; pessoa: string | null; dados: Record<string, unknown> | null; criadoEm: Date };

export async function historicoDaClinica(userId: string, tenantId: string, limite = 200, database?: Database): Promise<EventoHistorico[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ origem: "plataforma" | "espaco"; acao: string; pessoa: string | null; dados: Record<string, unknown> | null; criado_em: string }>(
        sql`select * from app_plataforma_historico_clinica(${z.uuid().parse(tenantId)}, ${limite})`,
      );
      return rows.map((r) => ({ origem: r.origem, acao: r.acao, pessoa: r.pessoa, dados: r.dados, criadoEm: new Date(r.criado_em) }));
    },
    database,
  );
}

/** Quanto sairia a próxima fatura da clínica em cada plano ativo (com uso, condições e descontos atuais). */
export async function previaPorPlano(
  userId: string,
  tenantId: string,
  agora = new Date(),
  database: Database = getDb(),
): Promise<{ planoId: string; nome: string; valorCentavos: number }[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  const id = z.uuid().parse(tenantId);
  const planos = await database.select().from(planosSaas).where(eq(planosSaas.ativo, true));
  const competencia = primeiraCompetenciaCobrada(competenciaDe(hojeNoFuso("America/Sao_Paulo", agora)));
  const resultado = [];
  for (const p of planos) {
    const previa = await previaDaFatura(id, competencia, agora, database, p.id);
    resultado.push({ planoId: p.id, nome: p.nome, valorCentavos: previa?.calculo.valorTotalCentavos ?? 0 });
  }
  return resultado.sort((a, b) => a.valorCentavos - b.valorCentavos);
}

/** Motivo do bloqueio para quem participa de um espaço suspenso ou cancelado (tela /conta-suspensa). */
export async function motivoDoBloqueio(userId: string, database?: Database): Promise<{ status: string; motivo: string | null } | null> {
  return withUser(
    userId,
    async (tx) => {
      const { rows } = await tx.execute<{ status: string; motivo: string | null }>(sql`select * from app_motivo_espaco_bloqueado()`);
      return rows[0] ?? null;
    },
    database,
  );
}
