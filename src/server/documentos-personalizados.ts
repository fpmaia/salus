import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { modelosDocumento, papeisTimbrados, profissionais, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { LIMITE_TITULO } from "../domain/prontuario";
import {
  ALINHAMENTOS,
  aplicarVariaveis,
  CABECALHO_PADRAO,
  LIMITE_TEXTO_TIMBRADO,
  logoComoDataUrl,
  RODAPE_PADRAO,
  tipoDaImagem,
  validarLogo,
  type Alinhamento,
  type DadosTimbrado,
} from "../domain/papel-timbrado";
import { exigirPermissao, pode } from "../domain/rbac";
import { ErroNegocio } from "./erros";
import { exigirModulo } from "./modulos";
import { profissionalDoUsuario } from "./profissionais";

// Personalização dos documentos: modelos (da clínica e de cada profissional) e papel timbrado
// (cabeçalho, rodapé e logo). O admin cuida do que é da clínica; cada profissional, do seu.

export type Escopo = "clinica" | "meu";

export type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  titulo: string;
  anotacoes: string;
  prescricao: string;
  daClinica: boolean;
};

/** Profissional dono do escopo "meu" (null em "clinica"), já com a permissão conferida. */
async function donoDoEscopo(tx: Transaction, ctx: ContextoTenant, escopo: Escopo): Promise<string | null> {
  if (escopo === "clinica") {
    exigirPermissao(ctx.role, "documentos.clinica");
    return null;
  }
  exigirPermissao(ctx.role, "documentos.proprios");
  const proprio = await profissionalDoUsuario(tx, ctx.userId);
  if (!proprio?.ativo) throw new ErroNegocio("Seu usuário não está vinculado a um cadastro de profissional ativo");
  return proprio.id;
}

const doDono = (profissionalId: string | null) =>
  profissionalId === null ? isNull(modelosDocumento.profissionalId) : eq(modelosDocumento.profissionalId, profissionalId);

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

export const modeloSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao modelo").max(80),
  descricao: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => v || null),
  titulo: z.string().trim().max(LIMITE_TITULO).default(""),
  anotacoes: z.string().max(20_000, "Texto do modelo muito longo").default(""),
  prescricao: z.string().max(5_000).default(""),
});

const colunasModelo = {
  id: modelosDocumento.id,
  nome: modelosDocumento.nome,
  descricao: modelosDocumento.descricao,
  titulo: modelosDocumento.titulo,
  anotacoes: modelosDocumento.anotacoes,
  prescricao: modelosDocumento.prescricao,
  profissionalId: modelosDocumento.profissionalId,
};

/** Modelos que o usuário usa e/ou mantém: os da clínica e, para o profissional, os dele. */
export async function listarModelos(
  ctx: ContextoTenant,
  database?: Database,
): Promise<{ clinica: Modelo[]; meus: Modelo[]; podeEditarClinica: boolean; temProfissional: boolean }> {
  exigirPermissao(ctx.role, "documentos.personalizar");
  return withTenant(
    ctx,
    async (tx) => {
      await exigirModulo(tx, "prontuario");
      const proprio = pode(ctx.role, "documentos.proprios") ? await profissionalDoUsuario(tx, ctx.userId) : null;
      const linhas = await tx
        .select(colunasModelo)
        .from(modelosDocumento)
        .where(eq(modelosDocumento.ativo, true))
        .orderBy(asc(modelosDocumento.nome));
      const para = (l: (typeof linhas)[number]): Modelo => ({
        id: l.id,
        nome: l.nome,
        descricao: l.descricao,
        titulo: l.titulo,
        anotacoes: l.anotacoes,
        prescricao: l.prescricao,
        daClinica: l.profissionalId === null,
      });
      return {
        clinica: linhas.filter((l) => l.profissionalId === null).map(para),
        meus: proprio ? linhas.filter((l) => l.profissionalId === proprio.id).map(para) : [],
        podeEditarClinica: pode(ctx.role, "documentos.clinica"),
        temProfissional: Boolean(proprio?.ativo),
      };
    },
    database,
  );
}

/** Cria (sem `id`) ou altera um modelo do escopo. */
export async function salvarModelo(
  ctx: ContextoTenant,
  escopo: Escopo,
  id: string | null,
  dados: z.input<typeof modeloSchema>,
  database?: Database,
): Promise<{ id: string }> {
  const valores = modeloSchema.parse(dados);
  if (!valores.anotacoes.trim() && !valores.titulo) throw new ErroNegocio("O modelo precisa de um título ou de um texto");
  return withTenant(
    ctx,
    async (tx) => {
      await exigirModulo(tx, "prontuario");
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      if (id) {
        const [alterado] = await tx
          .update(modelosDocumento)
          .set(valores)
          .where(and(eq(modelosDocumento.id, id), doDono(profissionalId), eq(modelosDocumento.ativo, true)))
          .returning({ id: modelosDocumento.id });
        if (!alterado) throw new ErroNegocio("Modelo não encontrado");
        await registrarAuditoria(tx, { acao: "modelo_documento.alterado", entidade: "modelos_documento", entidadeId: id });
        return alterado;
      }
      const [novo] = await tx
        .insert(modelosDocumento)
        .values({ ...valores, profissionalId, criadoPor: ctx.userId })
        .returning({ id: modelosDocumento.id });
      await registrarAuditoria(tx, {
        acao: "modelo_documento.criado",
        entidade: "modelos_documento",
        entidadeId: novo.id,
        dados: { escopo, nome: valores.nome },
      });
      return novo;
    },
    database,
  );
}

export async function excluirModelo(ctx: ContextoTenant, escopo: Escopo, id: string, database?: Database): Promise<void> {
  await withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      const [excluido] = await tx
        .update(modelosDocumento)
        .set({ ativo: false })
        .where(and(eq(modelosDocumento.id, id), doDono(profissionalId), eq(modelosDocumento.ativo, true)))
        .returning({ id: modelosDocumento.id });
      if (!excluido) throw new ErroNegocio("Modelo não encontrado");
      await registrarAuditoria(tx, { acao: "modelo_documento.excluido", entidade: "modelos_documento", entidadeId: id });
    },
    database,
  );
}

// ---------------------------------------------------------------------------
// Papel timbrado
// ---------------------------------------------------------------------------

export type PapelTimbrado = {
  cabecalho: string;
  rodape: string;
  alinhamento: Alinhamento;
  mostrarLogo: boolean;
  /** data: URL (a CSP só libera imagens 'self' e data:). */
  logo: string | null;
  personalizado: boolean;
};

const textoTimbrado = z.string().max(LIMITE_TEXTO_TIMBRADO, `Use no máximo ${LIMITE_TEXTO_TIMBRADO} caracteres`);

export const papelTimbradoSchema = z.object({
  cabecalho: textoTimbrado,
  rodape: textoTimbrado,
  alinhamento: z.enum(ALINHAMENTOS).default("centro"),
  mostrarLogo: z.boolean().default(false),
  /** Nova logo (bytes); undefined mantém a atual. */
  logo: z.instanceof(Uint8Array).optional(),
  removerLogo: z.boolean().default(false),
});

function paraPapel(linha: typeof papeisTimbrados.$inferSelect | undefined): PapelTimbrado | null {
  if (!linha) return null;
  return {
    cabecalho: linha.cabecalho,
    rodape: linha.rodape,
    alinhamento: linha.alinhamento as Alinhamento,
    mostrarLogo: linha.mostrarLogo,
    logo: linha.logo && linha.logoTipo ? logoComoDataUrl(linha.logo, linha.logoTipo) : null,
    personalizado: true,
  };
}

const PAPEL_PADRAO: PapelTimbrado = {
  cabecalho: CABECALHO_PADRAO,
  rodape: RODAPE_PADRAO,
  alinhamento: "centro",
  mostrarLogo: false,
  logo: null,
  personalizado: false,
};

async function lerPapel(tx: Transaction, profissionalId: string | null) {
  const [linha] = await tx
    .select()
    .from(papeisTimbrados)
    .where(profissionalId === null ? isNull(papeisTimbrados.profissionalId) : eq(papeisTimbrados.profissionalId, profissionalId));
  return linha;
}

/** O papel timbrado do escopo, para editar (o padrão do sistema se ainda não foi salvo). */
export async function obterPapelTimbrado(ctx: ContextoTenant, escopo: Escopo, database?: Database): Promise<PapelTimbrado> {
  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      const proprio = paraPapel(await lerPapel(tx, profissionalId));
      if (proprio) return proprio;
      // O do profissional começa como cópia do da clínica.
      const daClinica = profissionalId ? paraPapel(await lerPapel(tx, null)) : null;
      return daClinica ? { ...daClinica, personalizado: false } : PAPEL_PADRAO;
    },
    database,
  );
}

export async function salvarPapelTimbrado(
  ctx: ContextoTenant,
  escopo: Escopo,
  dados: z.input<typeof papelTimbradoSchema>,
  database?: Database,
): Promise<void> {
  const valores = papelTimbradoSchema.parse(dados);
  if (valores.logo) {
    const erro = validarLogo(valores.logo);
    if (erro) throw new ErroNegocio(erro);
  }
  await withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      const atual = await lerPapel(tx, profissionalId);
      const logo = valores.removerLogo ? null : valores.logo ? Buffer.from(valores.logo) : (atual?.logo ?? null);
      const logoTipo = logo ? (valores.logo ? tipoDaImagem(valores.logo) : (atual?.logoTipo ?? null)) : null;
      const linha = {
        cabecalho: valores.cabecalho.trim(),
        rodape: valores.rodape.trim(),
        alinhamento: valores.alinhamento,
        mostrarLogo: valores.mostrarLogo && Boolean(logo),
        logo,
        logoTipo,
        atualizadoEm: new Date(),
      };
      if (atual) await tx.update(papeisTimbrados).set(linha).where(eq(papeisTimbrados.id, atual.id));
      else await tx.insert(papeisTimbrados).values({ ...linha, profissionalId });
      await registrarAuditoria(tx, {
        acao: "papel_timbrado.salvo",
        entidade: "papeis_timbrados",
        entidadeId: atual?.id,
        dados: { escopo, logo: Boolean(logo), mostrarLogo: linha.mostrarLogo },
      });
    },
    database,
  );
}

/** Volta ao padrão: apaga o personalizado do escopo (o do profissional volta a seguir o da clínica). */
export async function restaurarPapelTimbrado(ctx: ContextoTenant, escopo: Escopo, database?: Database): Promise<void> {
  await withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      const atual = await lerPapel(tx, profissionalId);
      if (!atual) return;
      await tx.delete(papeisTimbrados).where(eq(papeisTimbrados.id, atual.id));
      await registrarAuditoria(tx, { acao: "papel_timbrado.restaurado", entidade: "papeis_timbrados", entidadeId: atual.id, dados: { escopo } });
    },
    database,
  );
}

/** Cabeçalho e rodapé prontos para imprimir (variáveis já trocadas). */
export type TimbradoImpressao = { cabecalho: string[]; rodape: string[]; alinhamento: Alinhamento; logo: string | null };

/**
 * Resolve o papel timbrado de um documento: o do profissional emitente, senão o da clínica,
 * senão o padrão. Roda em qualquer transação do tenant (a RLS isola o espaço).
 */
export async function timbradoParaImpressao(tx: Transaction, profissionalId: string | null): Promise<TimbradoImpressao> {
  const doProfissional = profissionalId ? await lerPapel(tx, profissionalId) : undefined;
  const daClinica = await lerPapel(tx, null);
  const papel = paraPapel(doProfissional ?? daClinica) ?? PAPEL_PADRAO;

  const dados = await dadosParaTimbrado(tx, profissionalId);
  const linhas = (texto: string, padrao: string) => aplicarVariaveis(texto || padrao, dados).split("\n").filter(Boolean);
  return {
    cabecalho: linhas(papel.cabecalho, CABECALHO_PADRAO),
    rodape: linhas(papel.rodape, RODAPE_PADRAO),
    alinhamento: papel.alinhamento,
    logo: papel.mostrarLogo ? papel.logo : null,
  };
}

/** Valores das variáveis ({clinica}, {profissional}…) para um profissional ou só a clínica. */
async function dadosParaTimbrado(tx: Transaction, profissionalId: string | null): Promise<DadosTimbrado> {
  const [espaco] = await tx.select({ nome: tenants.nome }).from(tenants);
  const [prof] = profissionalId
    ? await tx
        .select({
          nome: profissionais.nome,
          especialidade: profissionais.especialidade,
          conselho: profissionais.conselho,
          registro: profissionais.registro,
          email: profissionais.email,
          telefone: profissionais.telefone,
        })
        .from(profissionais)
        .where(eq(profissionais.id, profissionalId))
    : [];
  const [unidade] = await tx
    .select({ endereco: unidades.endereco })
    .from(unidades)
    .where(eq(unidades.ativo, true))
    .orderBy(asc(unidades.criadoEm))
    .limit(1);
  return {
    clinica: espaco?.nome ?? "",
    profissional: prof?.nome,
    especialidade: prof?.especialidade,
    conselho: prof?.conselho,
    registro: prof?.registro,
    email: prof?.email,
    telefone: prof?.telefone,
    endereco: unidade?.endereco,
  };
}

/** Dados para a prévia do editor: no escopo da clínica, um profissional de exemplo. */
export async function dadosDaPrevia(ctx: ContextoTenant, escopo: Escopo, database?: Database): Promise<DadosTimbrado> {
  return withTenant(
    ctx,
    async (tx) => {
      const profissionalId = await donoDoEscopo(tx, ctx, escopo);
      const dados = await dadosParaTimbrado(tx, profissionalId);
      return profissionalId
        ? dados
        : { ...dados, profissional: "Dra. Maria Exemplo", especialidade: "Clínica geral", conselho: "CRM", registro: "00000/UF", email: "maria@exemplo.com.br", telefone: "(11) 99999-0000" };
    },
    database,
  );
}

/** Atalho para as páginas de impressão. */
export async function timbradoDoDocumento(ctx: ContextoTenant, profissionalId: string | null, database?: Database) {
  return withTenant(ctx, (tx) => timbradoParaImpressao(tx, profissionalId), database);
}

/** Papel timbrado do profissional logado (o da clínica se ele não tiver cadastro de profissional). */
export async function timbradoDoUsuario(ctx: ContextoTenant, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const proprio = await profissionalDoUsuario(tx, ctx.userId);
      return timbradoParaImpressao(tx, proprio?.id ?? null);
    },
    database,
  );
}
