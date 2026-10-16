import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database } from "../db/client";
import { tenantSettings } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";

export async function obterConfiguracoes(ctx: ContextoTenant, database?: Database) {
  return withTenant(
    ctx,
    async (tx) => {
      const [config] = await tx.select().from(tenantSettings);
      return { antecedenciaCancelamentoHoras: config?.antecedenciaCancelamentoHoras ?? 24 };
    },
    database,
  );
}

export const politicaCancelamentoSchema = z.coerce
  .number("Informe a antecedência em horas")
  .int("Use horas inteiras")
  .min(0, "A antecedência não pode ser negativa")
  .max(168, "Máximo de 168 horas (7 dias)");

export async function definirPoliticaCancelamento(ctx: ContextoTenant, horas: number | string, database?: Database) {
  exigirPermissao(ctx.role, "tenant.configurar");
  const valor = politicaCancelamentoSchema.parse(horas);
  await withTenant(
    ctx,
    async (tx) => {
      await tx.update(tenantSettings).set({ antecedenciaCancelamentoHoras: valor });
      await registrarAuditoria(tx, {
        acao: "tenant.politica_cancelamento",
        entidade: "tenant_settings",
        dados: { antecedenciaCancelamentoHoras: valor },
      });
    },
    database,
  );
}
