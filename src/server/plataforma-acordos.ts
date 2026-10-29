import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "../db/client";
import { acordosSaas, faturasSaas } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant, withUser } from "../db/tenant";
import { MAXIMO_PARCELAS_ACORDO, validarAcordo } from "../domain/acordos";
import { exigirPermissao } from "../domain/rbac";
import { hojeNoFuso } from "../domain/tempo";
import { ErroGateway, gatewayDaPlataforma, type GatewayCobranca } from "./asaas";
import { enviarFatura } from "./assinatura";
import { ErroNegocio } from "./erros";
import { exigirAcessoPlataforma } from "./plataforma";
import { traduzirErroFinanceiro } from "./plataforma-financeiro";

// Acordo de renegociação (equipe Salus: Dono e Financeiro). Faturas em aberto da clínica viram
// parcelas, com desconto opcional. As parcelas são faturas comuns: pagam pelo Asaas, aceitam as
// mesmas operações e, em atraso, seguem a carência normal. Regras puras em domain/acordos.ts.

type Opcoes = { gateway?: GatewayCobranca; database?: Database; agora?: Date };

const ABERTAS = ["pendente", "vencida", "erro"] as const;

export const acordoSchema = z.object({
  faturasIds: z.array(z.uuid()).min(1, "Escolha ao menos uma fatura em aberto"),
  descontoCentavos: z.number().int().min(0),
  parcelas: z
    .array(z.object({ valorCentavos: z.number().int(), vencimento: z.iso.date("Data de parcela inválida") }))
    .min(1)
    .max(MAXIMO_PARCELAS_ACORDO),
  motivo: z.string().trim().min(3, "Informe o motivo do acordo").max(300),
});

export async function criarAcordo(
  userId: string,
  tenantId: string,
  dados: z.input<typeof acordoSchema>,
  opcoes: Opcoes = {},
): Promise<{ acordoId: string; parcelasEnviadas: number; erros: string[] }> {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = acordoSchema.parse(dados);
  const id = z.uuid().parse(tenantId);
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();

  // Confere tudo antes de mexer no Asaas: depois de cancelar lá, o banco não pode recusar.
  const originais = await withSistema(id, (tx) => tx.select().from(faturasSaas).where(inArray(faturasSaas.id, d.faturasIds)), database);
  if (originais.length !== d.faturasIds.length || originais.some((f) => !(ABERTAS as readonly string[]).includes(f.status))) {
    throw new ErroNegocio("Só entram no acordo faturas desta clínica ainda em aberto");
  }
  const valorOriginalCentavos = originais.reduce((t, f) => t + f.valorCentavos, 0);
  const motivo = validarAcordo({ valorOriginalCentavos, descontoCentavos: d.descontoCentavos, parcelas: d.parcelas, hoje: hojeNoFuso("America/Sao_Paulo", opcoes.agora) });
  if (motivo) throw new ErroNegocio(motivo);

  for (const f of originais) {
    if (f.status === "erro" || !f.asaasPaymentId) continue;
    try {
      await gateway.cancelarCobranca(f.asaasPaymentId);
    } catch (erro) {
      if (erro instanceof ErroGateway) throw new ErroNegocio(`O Asaas recusou cancelar a fatura de ${f.vencimento}: ${erro.message}`);
      throw erro;
    }
  }

  const acordoId = await withUser(
    userId,
    async (tx) => {
      const { rows } = await tx
        .execute<{ id: string }>(
          sql`select app_plataforma_criar_acordo(${id}, ${`{${d.faturasIds.join(",")}}`}::uuid[], ${d.descontoCentavos}, ${JSON.stringify(d.parcelas)}::jsonb, ${d.motivo}, ${gateway.ambiente}) as id`,
        )
        .catch(traduzirErroFinanceiro);
      return rows[0].id;
    },
    database,
  );

  // Cada parcela vai ao Asaas; a que falhar fica "erro" e o job (ou "Reenviar") tenta de novo.
  const parcelas = await withSistema(id, (tx) => tx.select({ id: faturasSaas.id }).from(faturasSaas).where(eq(faturasSaas.acordoId, acordoId)), database);
  const erros: string[] = [];
  let parcelasEnviadas = 0;
  for (const p of parcelas) {
    const r = await enviarFatura(id, p.id, gateway, database);
    if (r.enviada) parcelasEnviadas++;
    else if (r.erro) erros.push(r.erro);
  }
  return { acordoId, parcelasEnviadas, erros };
}

export async function cancelarAcordo(userId: string, tenantId: string, acordoId: string, motivo: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const m = z.string().trim().min(3, "Informe o motivo").max(300).parse(motivo);
  const abertas = await withSistema(
    z.uuid().parse(tenantId),
    (tx) => tx.select().from(faturasSaas).where(eq(faturasSaas.acordoId, z.uuid().parse(acordoId))),
    database,
  );
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  for (const f of abertas) {
    if (f.status !== "pendente" && f.status !== "vencida") continue;
    if (!f.asaasPaymentId) continue;
    try {
      await gateway.cancelarCobranca(f.asaasPaymentId);
    } catch (erro) {
      if (erro instanceof ErroGateway) throw new ErroNegocio(`O Asaas recusou cancelar a parcela de ${f.vencimento}: ${erro.message}`);
      throw erro;
    }
  }
  await withUser(userId, (tx) => tx.execute(sql`select app_plataforma_cancelar_acordo(${acordoId}, ${m})`).catch(traduzirErroFinanceiro), database);
}

type LinhaFatura = typeof faturasSaas.$inferSelect;
export type AcordoComParcelas = typeof acordosSaas.$inferSelect & { parcelasFaturas: LinhaFatura[]; originais: LinhaFatura[] };

async function acordosNaTransacao(tx: Parameters<Parameters<typeof withSistema>[1]>[0]): Promise<AcordoComParcelas[]> {
  const acordos = await tx.select().from(acordosSaas).orderBy(desc(acordosSaas.criadoEm));
  if (acordos.length === 0) return [];
  const faturas = await tx.select().from(faturasSaas).orderBy(asc(faturasSaas.vencimento));
  return acordos.map((a) => ({
    ...a,
    parcelasFaturas: faturas.filter((f) => f.acordoId === a.id),
    originais: faturas.filter((f) => f.substituidaPorAcordoId === a.id),
  }));
}

/** Acordos da clínica (ficha na plataforma). */
export async function listarAcordosDaClinica(userId: string, tenantId: string, database?: Database): Promise<AcordoComParcelas[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  return withSistema(z.uuid().parse(tenantId), acordosNaTransacao, database);
}

/** Acordos do próprio espaço (tela Assinatura do admin). */
export async function acordosDoEspaco(ctx: ContextoTenant, database?: Database): Promise<AcordoComParcelas[]> {
  exigirPermissao(ctx.role, "assinatura.ver");
  return withTenant(ctx, acordosNaTransacao, database);
}
