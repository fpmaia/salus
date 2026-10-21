import { eq } from "drizzle-orm";
import type { Database, Transaction } from "../db/client";
import { tenantSettings, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { hojeNoFuso, type DataLocal } from "../domain/tempo";

// Fuso como fonte única (C13): cada unidade tem o seu; o "hoje" do espaço é a data local mais
// atrasada entre as unidades ativas. Assim um mês só conta como encerrado quando acabou em todas.
// O fuso do espaço (tenant_settings) fica só como padrão de unidade nova e quando não há unidade.

export async function fusosDoEspaco(tx: Transaction): Promise<string[]> {
  const lista = await tx.selectDistinct({ timezone: unidades.timezone }).from(unidades).where(eq(unidades.ativo, true));
  if (lista.length > 0) return lista.map((u) => u.timezone);
  const [config] = await tx.select({ timezone: tenantSettings.timezone }).from(tenantSettings);
  return [config?.timezone ?? "America/Sao_Paulo"];
}

export async function hojeDoEspaco(tx: Transaction, agora = new Date()): Promise<DataLocal> {
  const datas = (await fusosDoEspaco(tx)).map((tz) => hojeNoFuso(tz, agora));
  return datas.reduce((menor, d) => (d < menor ? d : menor));
}

/** Para as páginas (fora de uma transação). */
export async function hojeNoEspaco(ctx: ContextoTenant, agora = new Date(), database?: Database): Promise<DataLocal> {
  return withTenant(ctx, (tx) => hojeDoEspaco(tx, agora), database);
}
