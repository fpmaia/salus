import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database } from "../db/client";
import { memberships, planosSaas, tenantSettings, tenants } from "../db/schema";
import { withTenant } from "../db/tenant";
import { analisarDocumento } from "../domain/documentos";
import { usarConviteClinica } from "./convites-clinica";
import { ErroNegocio } from "./erros";
import { listarMembershipsDoUsuario } from "./memberships";

export const dadosOnboardingSchema = z.object({
  nomeTenant: z.string().trim().min(2, "Informe o nome do espaço").max(120),
  documento: z.string().trim().min(1, "Informe o CPF ou CNPJ"),
  /** Token do convite trial da plataforma: plano do convite e período de teste grátis. */
  conviteTrial: z.string().optional(),
});

export class ErroOnboarding extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroOnboarding";
  }
}

/**
 * Onboarding mínimo: cria o tenant (plano Básico, ou o do convite trial), suas configurações e a membership
 * de admin do usuário, tudo numa transação dentro do contexto do novo tenant.
 */
export async function criarTenantComAdmin(
  userId: string,
  dados: z.input<typeof dadosOnboardingSchema>,
  database?: Database,
): Promise<{ tenantId: string }> {
  const { nomeTenant, documento, conviteTrial } = dadosOnboardingSchema.parse(dados);
  const doc = analisarDocumento(documento);
  if (!doc) throw new ErroOnboarding("CPF ou CNPJ inválido");

  // ADR 03: a UI é limitada a 1 tenant por usuário.
  const existentes = await listarMembershipsDoUsuario(userId, database);
  if (existentes.length > 0) throw new ErroOnboarding("Usuário já participa de um espaço");

  const tenantId = randomUUID();
  await withTenant(
    { tenantId, userId, role: "admin" },
    async (tx) => {
      const [plano] = await tx
        .select({ id: planosSaas.id })
        .from(planosSaas)
        .where(eq(planosSaas.codigo, "basico"));
      if (!plano) throw new ErroOnboarding("Plano padrão não encontrado");

      await tx.insert(tenants).values({
        id: tenantId,
        nome: nomeTenant,
        tipoDocumento: doc.tipo,
        documento: doc.digitos,
        planoId: plano.id,
      });
      await tx.insert(tenantSettings).values({});
      await tx.insert(memberships).values({ userId, role: "admin" });
      if (conviteTrial) {
        await usarConviteClinica(tx, conviteTrial).catch((erro) => {
          throw erro instanceof ErroNegocio ? new ErroOnboarding(erro.message) : erro;
        });
      }
      await registrarAuditoria(tx, {
        acao: "tenant.criado",
        entidade: "tenants",
        entidadeId: tenantId,
        dados: { nome: nomeTenant, plano: "basico" },
      });
    },
    database,
  );
  return { tenantId };
}
