import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { listaEspera, pacientes, profissionais } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";
import { ErroNegocio } from "./erros";

// Lista de espera: a recepção anota quem quer um horário (com um profissional ou qualquer um)
// e vê essas pessoas quando um horário abre. Nada é enviado automaticamente ao paciente.

export const esperaSchema = z.object({
  pacienteId: z.uuid("Escolha o paciente"),
  /** Omitido = qualquer profissional. */
  profissionalId: z.uuid().optional(),
  preferencia: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function adicionarNaEspera(
  ctx: ContextoTenant,
  dados: z.input<typeof esperaSchema>,
  database?: Database,
): Promise<{ id: string }> {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  const pedido = esperaSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const [paciente] = await tx.select({ ativo: pacientes.ativo }).from(pacientes).where(eq(pacientes.id, pedido.pacienteId));
      if (!paciente?.ativo) throw new ErroNegocio("Paciente não encontrado ou inativo");
      const [jaNaFila] = await tx
        .select({ id: listaEspera.id })
        .from(listaEspera)
        .where(
          and(
            eq(listaEspera.pacienteId, pedido.pacienteId),
            eq(listaEspera.status, "aguardando"),
            pedido.profissionalId ? eq(listaEspera.profissionalId, pedido.profissionalId) : isNull(listaEspera.profissionalId),
          ),
        );
      if (jaNaFila) throw new ErroNegocio("Este paciente já está na lista de espera");
      const [item] = await tx
        .insert(listaEspera)
        .values({ pacienteId: pedido.pacienteId, profissionalId: pedido.profissionalId ?? null, preferencia: pedido.preferencia })
        .returning({ id: listaEspera.id });
      await registrarAuditoria(tx, { acao: "espera.adicionado", entidade: "lista_espera", entidadeId: item.id });
      return item;
    },
    database,
  );
}

export async function removerDaEspera(ctx: ContextoTenant, id: string, database?: Database): Promise<void> {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  await withTenant(
    ctx,
    async (tx) => {
      const alterados = await tx
        .update(listaEspera)
        .set({ status: "removido" })
        .where(and(eq(listaEspera.id, id), eq(listaEspera.status, "aguardando")))
        .returning({ id: listaEspera.id });
      if (alterados.length === 0) throw new ErroNegocio("Item não está mais na lista de espera");
      await registrarAuditoria(tx, { acao: "espera.removido", entidade: "lista_espera", entidadeId: id });
    },
    database,
  );
}

/** Ao agendar o paciente com o profissional, ele sai da espera (desse profissional ou de "qualquer um"). */
export async function baixarDaEspera(tx: Transaction, pacienteId: string, profissionalId: string, agendamentoId: string) {
  await tx
    .update(listaEspera)
    .set({ status: "agendado", agendamentoId })
    .where(
      and(
        eq(listaEspera.pacienteId, pacienteId),
        eq(listaEspera.status, "aguardando"),
        or(eq(listaEspera.profissionalId, profissionalId), isNull(listaEspera.profissionalId)),
      ),
    );
}

export type ItemEspera = {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string | null;
  profissionalId: string | null;
  profissionalNome: string | null;
  preferencia: string | null;
  criadoEm: Date;
};

async function aguardando(tx: Transaction, profissionalIds?: string[]): Promise<ItemEspera[]> {
  return tx
    .select({
      id: listaEspera.id,
      pacienteId: listaEspera.pacienteId,
      pacienteNome: pacientes.nome,
      pacienteTelefone: pacientes.telefone,
      profissionalId: listaEspera.profissionalId,
      profissionalNome: profissionais.nome,
      preferencia: listaEspera.preferencia,
      criadoEm: listaEspera.criadoEm,
    })
    .from(listaEspera)
    .innerJoin(pacientes, eq(pacientes.id, listaEspera.pacienteId))
    .leftJoin(profissionais, eq(profissionais.id, listaEspera.profissionalId))
    .where(
      and(
        eq(listaEspera.status, "aguardando"),
        eq(pacientes.ativo, true),
        profissionalIds ? or(inArray(listaEspera.profissionalId, profissionalIds), isNull(listaEspera.profissionalId)) : undefined,
      ),
    )
    .orderBy(asc(listaEspera.criadoEm));
}

/** Quem está esperando, por ordem de chegada. */
export async function listarEspera(ctx: ContextoTenant, database?: Database): Promise<ItemEspera[]> {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  return withTenant(ctx, (tx) => aguardando(tx), database);
}

/**
 * Sugestões para horários que abriram: por profissional, quem espera por ele ou por qualquer
 * um (os que esperam por ele primeiro), até `limite` por profissional.
 */
export async function sugestoesDaEspera(
  ctx: ContextoTenant,
  profissionalIds: string[],
  limite = 3,
  database?: Database,
): Promise<Map<string, ItemEspera[]>> {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  const resultado = new Map<string, ItemEspera[]>();
  if (profissionalIds.length === 0) return resultado;
  const itens = await withTenant(ctx, (tx) => aguardando(tx, profissionalIds), database);
  for (const id of new Set(profissionalIds)) {
    const especificos = itens.filter((i) => i.profissionalId === id);
    const qualquer = itens.filter((i) => i.profissionalId === null);
    resultado.set(id, [...especificos, ...qualquer].slice(0, limite));
  }
  return resultado;
}
