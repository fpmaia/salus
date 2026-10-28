import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database, Transaction } from "../db/client";
import { tenantSettings } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";
import { ErroNegocio } from "./erros";

// Módulos opcionais por espaço (NFS-e, agendamento online, prontuário): desligados por padrão.
// Desligado, o módulo some do menu, as telas respondem 404 e a página pública fica indisponível.

export const MODULOS = ["fiscal", "agendaOnline", "prontuario"] as const;
export type Modulo = (typeof MODULOS)[number];
export type ModulosAtivos = Record<Modulo, boolean>;

export const ROTULOS_MODULO: Record<Modulo, { nome: string; descricao: string }> = {
  fiscal: { nome: "Notas fiscais (NFS-e)", descricao: "Emissão da nota de locação para os profissionais." },
  agendaOnline: { nome: "Agendamento online", descricao: "Página pública para o paciente marcar com o profissional." },
  prontuario: { nome: "Prontuário eletrônico", descricao: "Registro clínico cifrado do profissional (guarda de 20 anos)." },
};

async function ler(tx: Transaction): Promise<ModulosAtivos> {
  const [s] = await tx
    .select({ fiscal: tenantSettings.moduloFiscal, agendaOnline: tenantSettings.moduloAgendaOnline, prontuario: tenantSettings.moduloProntuario })
    .from(tenantSettings);
  return { fiscal: s?.fiscal ?? false, agendaOnline: s?.agendaOnline ?? false, prontuario: s?.prontuario ?? false };
}

/** Recusa a ação se o módulo estiver desligado (na transação da própria ação). */
export async function exigirModulo(tx: Transaction, modulo: Modulo): Promise<void> {
  if (!(await ler(tx))[modulo]) throw new ErroNegocio(`O módulo "${ROTULOS_MODULO[modulo].nome}" está desligado neste espaço`);
}

export async function modulosDoEspaco(ctx: ContextoTenant, database?: Database): Promise<ModulosAtivos> {
  return withTenant(ctx, ler, database);
}

/** Para as páginas públicas (sem sessão): o módulo está ligado no espaço? */
export async function moduloAtivoNoTenant(tenantId: string, modulo: Modulo, database?: Database): Promise<boolean> {
  return (await withSistema(tenantId, ler, database))[modulo];
}

export const modulosSchema = z.object({ fiscal: z.boolean(), agendaOnline: z.boolean(), prontuario: z.boolean() });

export async function definirModulos(ctx: ContextoTenant, dados: z.input<typeof modulosSchema>, database?: Database): Promise<void> {
  exigirPermissao(ctx.role, "tenant.configurar");
  const m = modulosSchema.parse(dados);
  await withTenant(
    ctx,
    async (tx) => {
      const antes = await ler(tx);
      if (antes.prontuario && !m.prontuario) {
        const { rows } = await tx.execute<{ tem: boolean }>(sql`select app_tenant_tem_prontuario() as tem`);
        if (rows[0]?.tem) throw new ErroNegocio("Há prontuários registrados: o módulo não pode ser desligado (guarda obrigatória de 20 anos)");
      }
      await tx
        .update(tenantSettings)
        .set({ moduloFiscal: m.fiscal, moduloAgendaOnline: m.agendaOnline, moduloProntuario: m.prontuario })
        .where(eq(tenantSettings.tenantId, ctx.tenantId));
      await registrarAuditoria(tx, { acao: "tenant.modulos", entidade: "tenant_settings", dados: { antes, depois: m } });
    },
    database,
  );
}
