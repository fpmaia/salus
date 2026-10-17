import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { erroPostgres, PG } from "../db/erros";
import {
  agendamentos,
  anexosClinicos,
  auditLog,
  compartilhamentosClinicos,
  memberships,
  pacientes,
  profissionais,
  registrosClinicos,
  users,
} from "../db/schema";
import { type ContextoTenant, withProntuario, withTenant } from "../db/tenant";
import { canonicoDoRegistro, validarAnexo, validarConteudo, type ConteudoClinico } from "../domain/prontuario";
import { exigirPermissao } from "../domain/rbac";
import { partesLocais } from "../domain/tempo";
import { armazenamentoDoAmbiente, type ArmazenamentoObjetos } from "./armazenamento";
import { chaveDoTenant, cifrarBytes, cifrarTexto, decifrarBytes, decifrarTexto, sha256 } from "./chave-tenant";
import { ErroNegocio } from "./erros";
import { pacienteVisivel, vincularPaciente } from "./pacientes";
import { profissionalDoUsuario } from "./profissionais";

type Opcoes = { agora?: Date; database?: Database };

const MENSAGENS: Record<string, string> = {
  "prontuario.imutavel": "Registro finalizado não pode ser alterado: use um adendo",
  "prontuario.campos_fixos": "Paciente, autor e tipo do registro não podem mudar",
  "prontuario.adendo_invalido": "O adendo precisa se referir a uma evolução finalizada sua deste paciente",
  "prontuario.anexo_fora_do_rascunho": "Anexos só podem ser incluídos ou removidos enquanto o registro é rascunho",
};

function traduzir(erro: unknown): never {
  const pg = erroPostgres(erro);
  if (pg?.code === PG.excecaoPlpgsql && MENSAGENS[pg.message]) throw new ErroNegocio(MENSAGENS[pg.message]);
  if (pg?.code === PG.violacaoUnica && pg.constraint === "compartilhamentos_clinicos_ativo_key") {
    throw new ErroNegocio("Este compartilhamento já está ativo");
  }
  throw erro;
}

/**
 * Executa como o profissional logado (RLS clínica por app.profissional_id). Só profissionais
 * com cadastro ativo usam o prontuário; admin e recepção não leem conteúdo clínico.
 */
async function comoProfissional<T>(
  ctx: ContextoTenant,
  fn: (tx: Transaction, profissionalId: string) => Promise<T>,
  database?: Database,
): Promise<T> {
  exigirPermissao(ctx.role, "prontuario.proprio");
  const proprio = await withTenant(ctx, (tx) => profissionalDoUsuario(tx, ctx.userId), database);
  if (!proprio?.ativo) throw new ErroNegocio("Seu cadastro de profissional não está ativo");
  return withProntuario(ctx, proprio.id, (tx) => fn(tx, proprio.id), { database });
}

const conteudoSchema = z.object({
  anotacoes: z.string().default(""),
  prescricao: z.string().default(""),
});

function lerConteudo(chave: Buffer, cifrado: string): ConteudoClinico {
  return conteudoSchema.parse(JSON.parse(decifrarTexto(chave, cifrado)));
}

async function exigirPacienteDoProfissional(tx: Transaction, profissionalId: string, pacienteId: string) {
  if (!(await pacienteVisivel(tx, { todos: false, profissionalId }, pacienteId))) throw new ErroNegocio("Paciente não encontrado");
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export const rascunhoSchema = z.object({
  registroId: z.uuid().optional(),
  pacienteId: z.uuid(),
  agendamentoId: z.uuid().nullable().optional(),
  anotacoes: z.string().default(""),
  prescricao: z.string().default(""),
});

/** Cria ou atualiza um rascunho de evolução. */
export async function salvarRascunho(ctx: ContextoTenant, dados: z.input<typeof rascunhoSchema>, opcoes: Opcoes = {}) {
  const d = rascunhoSchema.parse(dados);
  const conteudo = { anotacoes: d.anotacoes, prescricao: d.prescricao };
  const problema = validarConteudo(conteudo);
  if (problema) throw new ErroNegocio(problema);
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      await exigirPacienteDoProfissional(tx, profissionalId, d.pacienteId);
      if (d.agendamentoId) {
        const [a] = await tx
          .select({ id: agendamentos.id })
          .from(agendamentos)
          .where(and(eq(agendamentos.id, d.agendamentoId), eq(agendamentos.pacienteId, d.pacienteId), eq(agendamentos.profissionalId, profissionalId)));
        if (!a) throw new ErroNegocio("Atendimento não encontrado para este paciente");
      }
      const chave = await chaveDoTenant(tx);
      const conteudoCifrado = cifrarTexto(chave, JSON.stringify(conteudo));
      if (d.registroId) {
        const alterados = await tx
          .update(registrosClinicos)
          .set({ conteudoCifrado, agendamentoId: d.agendamentoId ?? null })
          .where(and(eq(registrosClinicos.id, d.registroId), eq(registrosClinicos.pacienteId, d.pacienteId)))
          .returning({ id: registrosClinicos.id })
          .catch(traduzir);
        if (alterados.length === 0) throw new ErroNegocio("Rascunho não encontrado");
        return { id: d.registroId };
      }
      const [r] = await tx
        .insert(registrosClinicos)
        .values({ pacienteId: d.pacienteId, profissionalId, agendamentoId: d.agendamentoId ?? null, conteudoCifrado })
        .returning({ id: registrosClinicos.id })
        .catch(traduzir);
      await registrarAuditoria(tx, { acao: "prontuario.rascunho", entidade: "registros_clinicos", entidadeId: r.id, dados: { pacienteId: d.pacienteId } });
      return r;
    },
    opcoes.database,
  );
}

/** Adendo (correção/complemento) de uma evolução finalizada: nasce como rascunho. */
export async function criarAdendo(ctx: ContextoTenant, registroId: string, conteudo: ConteudoClinico, opcoes: Opcoes = {}) {
  const problema = validarConteudo(conteudo);
  if (problema) throw new ErroNegocio(problema);
  return comoProfissional(
    ctx,
    async (tx) => {
      const [original] = await tx.select().from(registrosClinicos).where(eq(registrosClinicos.id, registroId));
      if (!original) throw new ErroNegocio("Registro não encontrado");
      const chave = await chaveDoTenant(tx);
      const [r] = await tx
        .insert(registrosClinicos)
        .values({
          pacienteId: original.pacienteId,
          profissionalId: original.profissionalId,
          tipo: "adendo",
          adendoDe: original.id,
          conteudoCifrado: cifrarTexto(chave, JSON.stringify(conteudo)),
        })
        .returning({ id: registrosClinicos.id })
        .catch(traduzir);
      return r;
    },
    opcoes.database,
  );
}

/** Finaliza: o registro fica imutável, com hash do conteúdo + anexos + autoria + data. */
export async function finalizarRegistro(ctx: ContextoTenant, registroId: string, opcoes: Opcoes = {}) {
  const agora = opcoes.agora ?? new Date();
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      const [r] = await tx
        .select()
        .from(registrosClinicos)
        .where(and(eq(registrosClinicos.id, registroId), eq(registrosClinicos.profissionalId, profissionalId)))
        .for("update");
      if (!r) throw new ErroNegocio("Registro não encontrado");
      if (r.status === "finalizado") throw new ErroNegocio("Este registro já está finalizado");
      const chave = await chaveDoTenant(tx);
      const anexos = await tx.select({ hash: anexosClinicos.hashArquivo }).from(anexosClinicos).where(eq(anexosClinicos.registroId, r.id));
      // O banco guarda microssegundos; o hash usa milissegundos para casar na verificação.
      const finalizadoEm = new Date(Math.floor(agora.getTime()));
      const hash = sha256(
        canonicoDoRegistro({ ...r, conteudo: lerConteudo(chave, r.conteudoCifrado), anexos: anexos.map((a) => a.hash), finalizadoEm }),
      );
      await tx
        .update(registrosClinicos)
        .set({ status: "finalizado", finalizadoEm, hashIntegridade: hash })
        .where(eq(registrosClinicos.id, r.id))
        .catch(traduzir);
      await registrarAuditoria(tx, {
        acao: "prontuario.finalizado",
        entidade: "registros_clinicos",
        entidadeId: r.id,
        dados: { pacienteId: r.pacienteId, hash },
      });
      return { hash };
    },
    opcoes.database,
  );
}

export async function descartarRascunho(ctx: ContextoTenant, registroId: string, opcoes: Opcoes = {}) {
  await comoProfissional(
    ctx,
    async (tx) => {
      await tx.delete(anexosClinicos).where(eq(anexosClinicos.registroId, registroId)).catch(traduzir);
      const removidos = await tx.delete(registrosClinicos).where(eq(registrosClinicos.id, registroId)).returning().catch(traduzir);
      if (removidos.length === 0) throw new ErroNegocio("Rascunho não encontrado");
      await registrarAuditoria(tx, { acao: "prontuario.rascunho_descartado", entidade: "registros_clinicos", entidadeId: registroId });
    },
    opcoes.database,
  );
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

export async function anexarArquivo(
  ctx: ContextoTenant,
  registroId: string,
  arquivo: { nome: string; tipo: string; dados: Buffer },
  opcoes: Opcoes & { armazenamento?: ArmazenamentoObjetos } = {},
) {
  const problema = validarAnexo(arquivo.tipo, arquivo.dados.length);
  if (problema) throw new ErroNegocio(problema);
  const armazenamento = opcoes.armazenamento ?? armazenamentoDoAmbiente();
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      const [r] = await tx
        .select()
        .from(registrosClinicos)
        .where(and(eq(registrosClinicos.id, registroId), eq(registrosClinicos.profissionalId, profissionalId)));
      if (!r) throw new ErroNegocio("Registro não encontrado");
      if (r.status !== "rascunho") throw new ErroNegocio(MENSAGENS["prontuario.anexo_fora_do_rascunho"]);
      const chave = await chaveDoTenant(tx);
      const chaveObjeto = `t/${ctx.tenantId}/p/${r.pacienteId}/${randomUUID()}`;
      await armazenamento.enviar(chaveObjeto, cifrarBytes(chave, arquivo.dados));
      const [anexo] = await tx
        .insert(anexosClinicos)
        .values({
          registroId,
          pacienteId: r.pacienteId,
          profissionalId,
          nomeArquivo: arquivo.nome.slice(0, 200),
          tipoMime: arquivo.tipo,
          tamanhoBytes: arquivo.dados.length,
          hashArquivo: sha256(arquivo.dados),
          chaveObjeto,
        })
        .returning({ id: anexosClinicos.id })
        .catch(traduzir);
      await registrarAuditoria(tx, { acao: "prontuario.anexo_incluido", entidade: "anexos_clinicos", entidadeId: anexo.id, dados: { registroId } });
      return anexo;
    },
    opcoes.database,
  );
}

/** Download autorizado pela RLS, decifrado e com integridade conferida. Auditado. */
export async function baixarAnexo(ctx: ContextoTenant, anexoId: string, opcoes: Opcoes & { armazenamento?: ArmazenamentoObjetos } = {}) {
  const armazenamento = opcoes.armazenamento ?? armazenamentoDoAmbiente();
  return comoProfissional(
    ctx,
    async (tx) => {
      const [a] = await tx.select().from(anexosClinicos).where(eq(anexosClinicos.id, anexoId));
      if (!a) throw new ErroNegocio("Anexo não encontrado");
      const dados = decifrarBytes(await chaveDoTenant(tx), await armazenamento.obter(a.chaveObjeto));
      if (sha256(dados) !== a.hashArquivo) throw new ErroNegocio("O arquivo não confere com o registrado (integridade)");
      await registrarAuditoria(tx, { acao: "prontuario.anexo_baixado", entidade: "anexos_clinicos", entidadeId: a.id, dados: { pacienteId: a.pacienteId } });
      return { nome: a.nomeArquivo, tipo: a.tipoMime, dados };
    },
    opcoes.database,
  );
}

// ---------------------------------------------------------------------------
// Compartilhamento
// ---------------------------------------------------------------------------

export const compartilhamentoSchema = z.object({
  pacienteId: z.uuid(),
  paraProfissionalId: z.uuid("Escolha o profissional"),
  consentimento: z.string().trim().min(10, "Descreva como o consentimento do paciente foi obtido").max(300),
});

export async function compartilharProntuario(ctx: ContextoTenant, dados: z.input<typeof compartilhamentoSchema>, opcoes: Opcoes = {}) {
  const d = compartilhamentoSchema.parse(dados);
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      await exigirPacienteDoProfissional(tx, profissionalId, d.pacienteId);
      if (d.paraProfissionalId === profissionalId) throw new ErroNegocio("Escolha outro profissional");
      const [para] = await tx.select().from(profissionais).where(eq(profissionais.id, d.paraProfissionalId));
      if (!para?.ativo) throw new ErroNegocio("Profissional não encontrado");
      const [c] = await tx
        .insert(compartilhamentosClinicos)
        .values({ pacienteId: d.pacienteId, deProfissionalId: profissionalId, paraProfissionalId: para.id, consentimento: d.consentimento })
        .returning({ id: compartilhamentosClinicos.id })
        .catch(traduzir);
      // Quem recebe passa a atender o paciente: ganha o vínculo (vê o cadastro dele).
      await vincularPaciente(tx, d.pacienteId, para.id);
      await registrarAuditoria(tx, {
        acao: "prontuario.compartilhado",
        entidade: "compartilhamentos_clinicos",
        entidadeId: c.id,
        dados: { pacienteId: d.pacienteId, para: para.id, consentimento: d.consentimento },
      });
      return c;
    },
    opcoes.database,
  );
}

export async function revogarCompartilhamento(ctx: ContextoTenant, compartilhamentoId: string, opcoes: Opcoes = {}) {
  const agora = opcoes.agora ?? new Date();
  await comoProfissional(
    ctx,
    async (tx) => {
      const alterados = await tx
        .update(compartilhamentosClinicos)
        .set({ revogadoEm: agora })
        .where(and(eq(compartilhamentosClinicos.id, compartilhamentoId), isNull(compartilhamentosClinicos.revogadoEm)))
        .returning({ id: compartilhamentosClinicos.id });
      if (alterados.length === 0) throw new ErroNegocio("Compartilhamento não encontrado");
      await registrarAuditoria(tx, { acao: "prontuario.compartilhamento_revogado", entidade: "compartilhamentos_clinicos", entidadeId: compartilhamentoId });
    },
    opcoes.database,
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type RegistroLido = {
  id: string;
  tipo: "evolucao" | "adendo";
  adendoDe: string | null;
  status: "rascunho" | "finalizado";
  autorId: string;
  autorNome: string;
  proprio: boolean;
  agendamentoId: string | null;
  conteudo: ConteudoClinico;
  criadoEm: Date;
  finalizadoEm: Date | null;
  hash: string | null;
  integro: boolean | null; // null = rascunho
  anexos: { id: string; nome: string; tipo: string; tamanho: number }[];
};

/** Lê os registros visíveis (RLS), decifra e confere a integridade dos finalizados. */
async function lerRegistros(tx: Transaction, pacienteId: string, quem: string | null, filtroAutor?: string): Promise<RegistroLido[]> {
  const linhas = await tx
    .select({ r: registrosClinicos, autorNome: profissionais.nome })
    .from(registrosClinicos)
    .innerJoin(profissionais, eq(profissionais.id, registrosClinicos.profissionalId))
    .where(and(eq(registrosClinicos.pacienteId, pacienteId), filtroAutor ? eq(registrosClinicos.profissionalId, filtroAutor) : undefined))
    .orderBy(asc(registrosClinicos.criadoEm));
  if (linhas.length === 0) return [];
  const chave = await chaveDoTenant(tx);
  const anexos = await tx
    .select()
    .from(anexosClinicos)
    .where(inArray(anexosClinicos.registroId, linhas.map((l) => l.r.id)));
  return linhas.map(({ r, autorNome }) => {
    const conteudo = lerConteudo(chave, r.conteudoCifrado);
    const doRegistro = anexos.filter((a) => a.registroId === r.id);
    const integro =
      r.status === "finalizado" && r.finalizadoEm
        ? sha256(canonicoDoRegistro({ ...r, conteudo, anexos: doRegistro.map((a) => a.hashArquivo), finalizadoEm: r.finalizadoEm })) ===
          r.hashIntegridade
        : null;
    return {
      id: r.id,
      tipo: r.tipo,
      adendoDe: r.adendoDe,
      status: r.status,
      autorId: r.profissionalId,
      autorNome,
      proprio: r.profissionalId === quem,
      agendamentoId: r.agendamentoId,
      conteudo,
      criadoEm: r.criadoEm,
      finalizadoEm: r.finalizadoEm,
      hash: r.hashIntegridade,
      integro,
      anexos: doRegistro.map((a) => ({ id: a.id, nome: a.nomeArquivo, tipo: a.tipoMime, tamanho: a.tamanhoBytes })),
    };
  });
}

/** Prontuário do paciente para o profissional logado (próprios + compartilhados). Auditado. */
export async function obterProntuario(ctx: ContextoTenant, pacienteId: string, opcoes: Opcoes = {}) {
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      await exigirPacienteDoProfissional(tx, profissionalId, pacienteId);
      const [paciente] = await tx
        .select({ id: pacientes.id, nome: pacientes.nome, dataNascimento: pacientes.dataNascimento })
        .from(pacientes)
        .where(eq(pacientes.id, pacienteId));
      const registros = await lerRegistros(tx, pacienteId, profissionalId);
      const compartilhamentos = await tx
        .select({ c: compartilhamentosClinicos, paraNome: profissionais.nome })
        .from(compartilhamentosClinicos)
        .innerJoin(profissionais, eq(profissionais.id, compartilhamentosClinicos.paraProfissionalId))
        .where(and(eq(compartilhamentosClinicos.pacienteId, pacienteId), eq(compartilhamentosClinicos.deProfissionalId, profissionalId)))
        .orderBy(desc(compartilhamentosClinicos.criadoEm));
      const colegas = await tx
        .select({ id: profissionais.id, nome: profissionais.nome })
        .from(profissionais)
        .where(and(eq(profissionais.ativo, true), ne(profissionais.id, profissionalId)))
        .orderBy(asc(profissionais.nome));
      const atendimentos = await tx
        .select({ id: agendamentos.id, periodo: agendamentos.periodo, status: agendamentos.status })
        .from(agendamentos)
        .where(and(eq(agendamentos.pacienteId, pacienteId), eq(agendamentos.profissionalId, profissionalId), ne(agendamentos.status, "cancelado")))
        .orderBy(desc(agendamentos.periodo))
        .limit(30);
      await registrarAuditoria(tx, {
        acao: "prontuario.lido",
        entidade: "pacientes",
        entidadeId: pacienteId,
        dados: { registros: registros.map((r) => r.id) },
      });
      return {
        paciente,
        registros,
        compartilhamentos: compartilhamentos.map(({ c, paraNome }) => ({ ...c, paraNome })),
        colegas,
        atendimentos: atendimentos.map((a) => ({ id: a.id, status: a.status, inicio: a.periodo.inicio })),
        profissionalId,
      };
    },
    opcoes.database,
  );
}

/** Versão para impressão/PDF (só finalizados), auditada como exportação. */
export async function exportarProntuario(ctx: ContextoTenant, pacienteId: string, opcoes: Opcoes = {}) {
  return comoProfissional(
    ctx,
    async (tx, profissionalId) => {
      await exigirPacienteDoProfissional(tx, profissionalId, pacienteId);
      const [paciente] = await tx.select().from(pacientes).where(eq(pacientes.id, pacienteId));
      const registros = (await lerRegistros(tx, pacienteId, profissionalId)).filter((r) => r.status === "finalizado");
      await registrarAuditoria(tx, { acao: "prontuario.exportado", entidade: "pacientes", entidadeId: pacienteId, dados: { registros: registros.length } });
      return { paciente, registros, solicitacao: null as null | { justificativa: string; profissionalNome: string } };
    },
    opcoes.database,
  );
}

// ---------------------------------------------------------------------------
// Solicitação formal (admin) — prontuário de profissional desativado
// ---------------------------------------------------------------------------

export const solicitacaoSchema = z.object({
  profissionalId: z.uuid("Escolha o profissional"),
  pacienteId: z.uuid("Escolha o paciente"),
  justificativa: z.string().trim().min(20, "Justifique a solicitação (mín. 20 caracteres)").max(500),
});

async function desligados(tx: Transaction) {
  const lista = await tx
    .select({ id: profissionais.id, nome: profissionais.nome, ativo: profissionais.ativo, membroAtivo: memberships.ativo })
    .from(profissionais)
    .leftJoin(memberships, eq(memberships.id, profissionais.membershipId))
    .orderBy(asc(profissionais.nome));
  return lista.filter((p) => !p.ativo || p.membroAtivo === false);
}

/** Profissionais desativados (ou sem acesso ativo): alvo da solicitação formal. */
export async function profissionaisDesligados(ctx: ContextoTenant, database?: Database) {
  exigirPermissao(ctx.role, "prontuario.solicitacao");
  return withTenant(ctx, desligados, database);
}

/** Registra a solicitação (auditada) e devolve o id que libera a visualização por 1 hora. */
export async function solicitarProntuario(ctx: ContextoTenant, dados: z.input<typeof solicitacaoSchema>, database?: Database) {
  exigirPermissao(ctx.role, "prontuario.solicitacao");
  const d = solicitacaoSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      if (!(await desligados(tx)).some((p) => p.id === d.profissionalId)) {
        throw new ErroNegocio("A solicitação vale só para prontuários de profissional desligado; os ativos exportam os próprios");
      }
      const [registro] = await tx
        .insert(auditLog)
        .values({ acao: "prontuario.solicitacao", entidade: "pacientes", entidadeId: d.pacienteId, dados: d })
        .returning({ id: auditLog.id });
      return { solicitacaoId: registro.id };
    },
    database,
  );
}

/** Conteúdo liberado por uma solicitação recente do próprio admin. */
export async function lerSolicitacao(ctx: ContextoTenant, solicitacaoId: string, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "prontuario.solicitacao");
  const agora = opcoes.agora ?? new Date();
  const [s] = await withTenant(
    ctx,
    (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.id, z.uuid().parse(solicitacaoId)),
            eq(auditLog.acao, "prontuario.solicitacao"),
            eq(auditLog.userId, ctx.userId),
            gt(auditLog.criadoEm, new Date(agora.getTime() - 3_600_000)),
          ),
        ),
    opcoes.database,
  );
  if (!s) throw new ErroNegocio("Solicitação não encontrada ou expirada");
  const d = solicitacaoSchema.parse(s.dados);
  return withProntuario(
    ctx,
    null,
    async (tx) => {
      const [paciente] = await tx.select().from(pacientes).where(eq(pacientes.id, d.pacienteId));
      const [autor] = await tx.select({ nome: profissionais.nome }).from(profissionais).where(eq(profissionais.id, d.profissionalId));
      const registros = (await lerRegistros(tx, d.pacienteId, null, d.profissionalId)).filter((r) => r.status === "finalizado");
      await registrarAuditoria(tx, {
        acao: "prontuario.exportado",
        entidade: "pacientes",
        entidadeId: d.pacienteId,
        dados: { solicitacaoId, registros: registros.length },
      });
      return { paciente, registros, solicitacao: { justificativa: d.justificativa, profissionalNome: autor?.nome ?? "" } };
    },
    { solicitacao: true, database: opcoes.database },
  );
}

export const ROTULOS_ACESSO: Record<string, string> = {
  "prontuario.lido": "Leitura",
  "prontuario.exportado": "Exportação",
  "prontuario.solicitacao": "Solicitação formal",
  "prontuario.anexo_baixado": "Download de anexo",
};

/** Relatório de acessos ao prontuário de um paciente (direito do titular, LGPD). Admin; sem conteúdo clínico. */
export async function acessosAoProntuario(ctx: ContextoTenant, pacienteId: string, database?: Database) {
  exigirPermissao(ctx.role, "auditoria.ver");
  return withTenant(
    ctx,
    (tx) =>
      tx
        .select({ id: auditLog.id, acao: auditLog.acao, usuarioNome: users.name, criadoEm: auditLog.criadoEm })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(
          or(
            and(eq(auditLog.entidadeId, pacienteId), inArray(auditLog.acao, ["prontuario.lido", "prontuario.exportado", "prontuario.solicitacao"])),
            and(eq(auditLog.acao, "prontuario.anexo_baixado"), sql`${auditLog.dados}->>'pacienteId' = ${pacienteId}`),
          ),
        )
        .orderBy(desc(auditLog.criadoEm))
        .limit(200),
    database,
  );
}

export function horarioLocal(instante: Date, timezone = "America/Sao_Paulo") {
  const p = partesLocais(instante, timezone);
  return `${p.data.slice(8, 10)}/${p.data.slice(5, 7)}/${p.data.slice(0, 4)} ${p.hora}`;
}
