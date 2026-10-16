import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import { feriados, horariosFuncionamento, recursosSala, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";
import { SLOTS_PERMITIDOS, type ConfigUnidade } from "../domain/reservas";
import { dataValida, horaValida, minutosDoDia, timezoneValido } from "../domain/tempo";
import { ErroNegocio } from "./erros";

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const unidadeSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da unidade").max(120),
  endereco: textoOpcional(300),
  timezone: z.string().refine(timezoneValido, "Fuso horário inválido").default("America/Sao_Paulo"),
  slotMinutos: z.coerce
    .number()
    .refine((v) => (SLOTS_PERMITIDOS as readonly number[]).includes(v), "Slot deve ser 15, 30 ou 60 minutos")
    .default(30),
});

const horaSchema = z.string().refine((v) => horaValida(v) || v === "24:00", "Horário inválido");

export const horarioSchema = z.object({
  diaSemana: z.coerce.number().int().min(0).max(6),
  abre: horaSchema,
  fecha: horaSchema,
});

export const salaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da sala").max(80),
  descricao: textoOpcional(300),
  recursos: z
    .array(z.string().trim().max(60))
    .default([])
    .transform((lista) => [...new Set(lista.filter(Boolean))]),
});

export const feriadoSchema = z.object({
  unidadeId: z.uuid().nullable(),
  data: z.string().refine(dataValida, "Data inválida"),
  descricao: z.string().trim().min(2, "Informe a descrição").max(120),
});

// Horário padrão de uma unidade nova: segunda a sexta, 08:00–18:00.
const HORARIO_PADRAO = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: "08:00", fecha: "18:00" }));

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

export async function criarUnidade(
  ctx: ContextoTenant,
  dados: z.input<typeof unidadeSchema>,
  database?: Database,
): Promise<{ id: string }> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const valores = unidadeSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const [unidade] = await tx.insert(unidades).values(valores).returning({ id: unidades.id });
      await tx.insert(horariosFuncionamento).values(HORARIO_PADRAO.map((h) => ({ ...h, unidadeId: unidade.id })));
      await registrarAuditoria(tx, { acao: "unidade.criada", entidade: "unidades", entidadeId: unidade.id, dados: valores });
      return unidade;
    },
    database,
  );
}

export async function atualizarUnidade(
  ctx: ContextoTenant,
  unidadeId: string,
  dados: z.input<typeof unidadeSchema> & { ativo?: boolean },
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const valores = { ...unidadeSchema.parse(dados), ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }) };
  await withTenant(
    ctx,
    async (tx) => {
      const alteradas = await tx.update(unidades).set(valores).where(eq(unidades.id, unidadeId)).returning({ id: unidades.id });
      if (alteradas.length === 0) throw new ErroNegocio("Unidade não encontrada");
      await registrarAuditoria(tx, { acao: "unidade.atualizada", entidade: "unidades", entidadeId: unidadeId, dados: valores });
    },
    database,
  );
}

/** Substitui todos os horários de funcionamento da unidade. */
export async function definirHorarios(
  ctx: ContextoTenant,
  unidadeId: string,
  horarios: z.input<typeof horarioSchema>[],
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const lista = z.array(horarioSchema).parse(horarios);

  await withTenant(
    ctx,
    async (tx) => {
      const [unidade] = await tx
        .select({ slotMinutos: unidades.slotMinutos })
        .from(unidades)
        .where(eq(unidades.id, unidadeId));
      if (!unidade) throw new ErroNegocio("Unidade não encontrada");

      const porDia = new Map<number, { abre: number; fecha: number }[]>();
      for (const h of lista) {
        const abre = minutosDoDia(h.abre);
        const fecha = minutosDoDia(h.fecha);
        if (fecha <= abre) throw new ErroNegocio("O fechamento deve ser depois da abertura");
        if (abre % unidade.slotMinutos !== 0 || fecha % unidade.slotMinutos !== 0) {
          throw new ErroNegocio(`Horários devem ser múltiplos de ${unidade.slotMinutos} minutos`);
        }
        const doDia = porDia.get(h.diaSemana) ?? [];
        if (doDia.some((i) => abre < i.fecha && i.abre < fecha)) {
          throw new ErroNegocio("Há intervalos sobrepostos no mesmo dia");
        }
        doDia.push({ abre, fecha });
        porDia.set(h.diaSemana, doDia);
      }

      await tx.delete(horariosFuncionamento).where(eq(horariosFuncionamento.unidadeId, unidadeId));
      if (lista.length > 0) {
        await tx.insert(horariosFuncionamento).values(lista.map((h) => ({ ...h, unidadeId })));
      }
      await registrarAuditoria(tx, {
        acao: "unidade.horarios_definidos",
        entidade: "unidades",
        entidadeId: unidadeId,
        dados: { horarios: lista },
      });
    },
    database,
  );
}

export async function adicionarFeriado(
  ctx: ContextoTenant,
  dados: z.input<typeof feriadoSchema>,
  database?: Database,
): Promise<{ id: string }> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const valores = feriadoSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const [feriado] = await tx.insert(feriados).values(valores).returning({ id: feriados.id });
      await registrarAuditoria(tx, { acao: "feriado.criado", entidade: "feriados", entidadeId: feriado.id, dados: valores });
      return feriado;
    },
    database,
  );
}

export async function removerFeriado(ctx: ContextoTenant, feriadoId: string, database?: Database): Promise<void> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  await withTenant(
    ctx,
    async (tx) => {
      const removidos = await tx.delete(feriados).where(eq(feriados.id, feriadoId)).returning();
      if (removidos.length === 0) throw new ErroNegocio("Feriado não encontrado");
      await registrarAuditoria(tx, {
        acao: "feriado.removido",
        entidade: "feriados",
        entidadeId: feriadoId,
        dados: { data: removidos[0].data, descricao: removidos[0].descricao },
      });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

function traduzirErroSala(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.violacaoUnica && pg.constraint === "salas_unidade_nome_key") {
    throw new ErroNegocio("Já existe uma sala com esse nome nesta unidade");
  }
  if (pg?.code === PG.violacaoFk) throw new ErroNegocio("Unidade não encontrada");
  throw erro;
}

async function gravarRecursos(tx: Transaction, salaId: string, recursos: string[]) {
  await tx.delete(recursosSala).where(eq(recursosSala.salaId, salaId));
  if (recursos.length > 0) await tx.insert(recursosSala).values(recursos.map((nome) => ({ salaId, nome })));
}

export async function criarSala(
  ctx: ContextoTenant,
  unidadeId: string,
  dados: z.input<typeof salaSchema>,
  database?: Database,
): Promise<{ id: string }> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const { recursos, ...valores } = salaSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const [sala] = await tx
        .insert(salas)
        .values({ ...valores, unidadeId })
        .returning({ id: salas.id })
        .catch(traduzirErroSala);
      await gravarRecursos(tx, sala.id, recursos);
      await registrarAuditoria(tx, { acao: "sala.criada", entidade: "salas", entidadeId: sala.id, dados: { ...valores, unidadeId, recursos } });
      return sala;
    },
    database,
  );
}

export async function atualizarSala(
  ctx: ContextoTenant,
  salaId: string,
  dados: z.input<typeof salaSchema> & { ativo: boolean },
  database?: Database,
): Promise<void> {
  exigirPermissao(ctx.role, "salas.gerenciar");
  const { recursos, ...valores } = salaSchema.parse(dados);
  await withTenant(
    ctx,
    async (tx) => {
      const alteradas = await tx
        .update(salas)
        .set({ ...valores, ativo: dados.ativo })
        .where(eq(salas.id, salaId))
        .returning({ id: salas.id })
        .catch(traduzirErroSala);
      if (alteradas.length === 0) throw new ErroNegocio("Sala não encontrada");
      await gravarRecursos(tx, salaId, recursos);
      await registrarAuditoria(tx, {
        acao: "sala.atualizada",
        entidade: "salas",
        entidadeId: salaId,
        dados: { ...valores, ativo: dados.ativo, recursos },
      });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listarUnidades(ctx: ContextoTenant, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const lista = await tx.select().from(unidades).orderBy(asc(unidades.nome));
      const contagens = await tx
        .select({ unidadeId: salas.unidadeId, total: count() })
        .from(salas)
        .where(eq(salas.ativo, true))
        .groupBy(salas.unidadeId);
      const porUnidade = new Map(contagens.map((c) => [c.unidadeId, c.total]));
      return lista.map((u) => ({ ...u, salasAtivas: porUnidade.get(u.id) ?? 0 }));
    },
    database,
  );
}

export async function obterUnidade(ctx: ContextoTenant, unidadeId: string, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const [unidade] = await tx.select().from(unidades).where(eq(unidades.id, unidadeId));
      if (!unidade) return null;
      const [horarios, feriadosDaUnidade, salasDaUnidade] = await Promise.all([
        tx
          .select()
          .from(horariosFuncionamento)
          .where(eq(horariosFuncionamento.unidadeId, unidadeId))
          .orderBy(asc(horariosFuncionamento.diaSemana), asc(horariosFuncionamento.abre)),
        tx
          .select()
          .from(feriados)
          .where(or(eq(feriados.unidadeId, unidadeId), isNull(feriados.unidadeId)))
          .orderBy(asc(feriados.data)),
        tx.select().from(salas).where(eq(salas.unidadeId, unidadeId)).orderBy(asc(salas.nome)),
      ]);
      const recursos = salasDaUnidade.length
        ? await tx
            .select()
            .from(recursosSala)
            .where(inArray(recursosSala.salaId, salasDaUnidade.map((s) => s.id)))
            .orderBy(asc(recursosSala.nome))
        : [];
      return {
        unidade,
        horarios,
        feriados: feriadosDaUnidade,
        salas: salasDaUnidade.map((s) => ({
          ...s,
          recursos: recursos.filter((r) => r.salaId === s.id).map((r) => r.nome),
        })),
      };
    },
    database,
  );
}

/** Configuração usada pelas regras de reserva (fuso, slot, horários e feriados). */
export async function carregarConfigUnidade(tx: Transaction, unidadeId: string): Promise<ConfigUnidade | null> {
  const [unidade] = await tx
    .select({ timezone: unidades.timezone, slotMinutos: unidades.slotMinutos })
    .from(unidades)
    .where(eq(unidades.id, unidadeId));
  if (!unidade) return null;
  const [horarios, listaFeriados] = await Promise.all([
    tx
      .select({ diaSemana: horariosFuncionamento.diaSemana, abre: horariosFuncionamento.abre, fecha: horariosFuncionamento.fecha })
      .from(horariosFuncionamento)
      .where(eq(horariosFuncionamento.unidadeId, unidadeId)),
    tx
      .select({ data: feriados.data })
      .from(feriados)
      .where(and(or(eq(feriados.unidadeId, unidadeId), isNull(feriados.unidadeId)))),
  ]);
  return { ...unidade, horarios, feriados: listaFeriados.map((f) => f.data) };
}
