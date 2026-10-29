import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "../db/client";
import { auditPlataforma, faturasSaas, memberships, tenants, users } from "../db/schema";
import { withSistema, withUser } from "../db/tenant";
import { formatarMoeda } from "../domain/dinheiro";
import { ErroGateway, gatewayDaPlataforma, type GatewayCobranca } from "./asaas";
import { enviarFatura } from "./assinatura";
import { emailDoAmbiente, type ProvedorEmail } from "./email";
import { emailFaturaSaas } from "./email-modelos";
import { ErroNegocio } from "./erros";
import { urlPublica } from "./links";
import { exigirAcessoPlataforma } from "./plataforma";
import { traduzirErroFinanceiro } from "./plataforma-financeiro";
import { formatarDataBr } from "./reservas";

// Operações da equipe Salus numa fatura em aberto: novo vencimento, ajuste de valor, cancelar,
// baixa manual, reenviar e fatura avulsa. Ordem: primeiro o Asaas (a fonte de cobrança do
// cliente), depois o banco pelas funções app_plataforma_fatura_* (migration 0048), que auditam.

type Opcoes = { gateway?: GatewayCobranca; database?: Database };

const motivoSchema = z.string().trim().min(3, "Informe o motivo").max(300, "Motivo até 300 caracteres");

/** A fatura da clínica (o RLS garante que é deste espaço). */
async function faturaDaClinica(tenantId: string, faturaId: string, database: Database) {
  const fatura = await withSistema(
    z.uuid().parse(tenantId),
    async (tx) => (await tx.select().from(faturasSaas).where(eq(faturasSaas.id, z.uuid().parse(faturaId))))[0],
    database,
  );
  if (!fatura) throw new ErroNegocio("Fatura não encontrada");
  if (!["pendente", "vencida", "erro"].includes(fatura.status)) throw new ErroNegocio("A fatura não está mais em aberto");
  return fatura;
}

/** Cobrança ativa no Asaas (fatura com erro de envio não chegou lá). */
function cobrancaRemota(fatura: typeof faturasSaas.$inferSelect): string | null {
  return fatura.status !== "erro" ? fatura.asaasPaymentId : null;
}

async function noGateway(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof ErroGateway) throw new ErroNegocio(`O Asaas recusou a alteração: ${erro.message}`);
    throw erro;
  }
}

function executar(userId: string, consulta: ReturnType<typeof sql>, database?: Database) {
  return withUser(userId, (tx) => tx.execute(consulta).catch(traduzirErroFinanceiro), database);
}

export async function alterarVencimentoFatura(
  userId: string,
  tenantId: string,
  faturaId: string,
  dados: { vencimento: string; motivo: string },
  opcoes: Opcoes = {},
) {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const vencimento = z.iso.date("Data inválida").parse(dados.vencimento);
  const motivo = motivoSchema.parse(dados.motivo);
  const fatura = await faturaDaClinica(tenantId, faturaId, database);
  const remota = cobrancaRemota(fatura);
  if (remota) await noGateway(() => (opcoes.gateway ?? gatewayDaPlataforma()).atualizarCobranca(remota, { vencimento }));
  await executar(userId, sql`select app_plataforma_fatura_vencimento(${fatura.id}, ${vencimento}::date, ${motivo})`, database);
}

export async function ajustarValorFatura(
  userId: string,
  tenantId: string,
  faturaId: string,
  dados: { valorCentavos: number; descricao: string; motivo: string },
  opcoes: Opcoes = {},
): Promise<{ valorCentavos: number }> {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const valor = z.number().int().refine((v) => v !== 0, "Informe um valor diferente de zero").parse(dados.valorCentavos);
  const descricao = z.string().trim().min(3, "Descreva o ajuste").max(200).parse(dados.descricao);
  const motivo = motivoSchema.parse(dados.motivo);
  const fatura = await faturaDaClinica(tenantId, faturaId, database);
  const novo = fatura.valorCentavos + valor;
  if (novo < 0) throw new ErroNegocio("O ajuste deixaria a fatura negativa");
  const remota = cobrancaRemota(fatura);
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  // Zerada: não há o que cobrar, a cobrança sai do Asaas e a fatura fica isenta.
  if (remota) await noGateway(() => (novo === 0 ? gateway.cancelarCobranca(remota) : gateway.atualizarCobranca(remota, { valorCentavos: novo })));
  await executar(userId, sql`select app_plataforma_fatura_ajuste(${fatura.id}, ${valor}, ${descricao}, ${motivo})`, database);
  return { valorCentavos: novo };
}

export async function cancelarFaturaClinica(userId: string, tenantId: string, faturaId: string, motivo: string, opcoes: Opcoes = {}) {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const m = motivoSchema.parse(motivo);
  const fatura = await faturaDaClinica(tenantId, faturaId, database);
  const remota = cobrancaRemota(fatura);
  if (remota) await noGateway(() => (opcoes.gateway ?? gatewayDaPlataforma()).cancelarCobranca(remota));
  await executar(userId, sql`select app_plataforma_fatura_cancelar(${fatura.id}, ${m})`, database);
}

/** Pago fora do Asaas: a cobrança de lá é cancelada para a clínica não pagar duas vezes. */
export async function darBaixaManualFatura(
  userId: string,
  tenantId: string,
  faturaId: string,
  dados: { pagoEm: string; observacao: string },
  opcoes: Opcoes = {},
) {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const pagoEm = z.iso.date("Data inválida").parse(dados.pagoEm);
  const observacao = z.string().trim().min(3, "Diga como foi pago (ex.: PIX direto em 12/10)").max(300).parse(dados.observacao);
  const fatura = await faturaDaClinica(tenantId, faturaId, database);
  const remota = cobrancaRemota(fatura);
  if (remota) await noGateway(() => (opcoes.gateway ?? gatewayDaPlataforma()).cancelarCobranca(remota));
  await executar(userId, sql`select app_plataforma_fatura_baixa(${fatura.id}, ${pagoEm}::date, ${observacao})`, database);
}

/**
 * Reenvia a cobrança: fatura com erro de envio volta para o Asaas; as demais vão por e-mail aos
 * administradores do espaço com o link de pagamento.
 */
export async function reenviarFaturaClinica(
  userId: string,
  tenantId: string,
  faturaId: string,
  opcoes: Opcoes & { provedor?: ProvedorEmail } = {},
): Promise<{ modo: "asaas" | "email"; enviados: number; erro?: string }> {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const fatura = await faturaDaClinica(tenantId, faturaId, database);
  if (fatura.status === "erro" || !fatura.asaasPaymentId) {
    const r = await enviarFatura(tenantId, fatura.id, opcoes.gateway ?? gatewayDaPlataforma(), database);
    return { modo: "asaas", enviados: r.enviada ? 1 : 0, erro: r.erro };
  }
  const { espaco, admins } = await withSistema(
    tenantId,
    async (tx) => {
      const [t] = await tx.select({ nome: tenants.nome }).from(tenants);
      const lista = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.role, "admin"), eq(memberships.ativo, true)));
      return { espaco: t?.nome ?? "", admins: lista.map((a) => a.email) };
    },
    database,
  );
  const provedor = opcoes.provedor ?? emailDoAmbiente();
  let enviados = 0;
  for (const para of admins) {
    const mensagem = emailFaturaSaas(para, {
      espaco,
      valor: formatarMoeda(fatura.valorCentavos),
      vencimento: formatarDataBr(fatura.vencimento),
      url: fatura.invoiceUrl ?? `${urlPublica()}/painel/assinatura`,
    });
    if (await provedor.enviar(mensagem).then(() => true, () => false)) enviados++;
  }
  await database
    .insert(auditPlataforma)
    .values({ userId, acao: "plataforma.fatura.reenviada", alvoTipo: "tenant", alvoId: tenantId, dados: { faturaId: fatura.id, emails: enviados } });
  return { modo: "email", enviados };
}

export const faturaAvulsaSchema = z.object({
  itens: z
    .array(
      z.object({
        descricao: z.string().trim().min(3, "Descreva cada item").max(200),
        valorCentavos: z.number().int().positive("Cada item precisa de valor maior que zero"),
      }),
    )
    .min(1, "Inclua ao menos um item")
    .max(20),
  vencimento: z.iso.date("Data inválida"),
  observacao: z.string().trim().min(3, "Diga do que é a cobrança").max(200),
});

/** Cobrança fora da mensalidade (implantação, treinamento, migração de dados…). */
export async function criarFaturaAvulsa(
  userId: string,
  tenantId: string,
  dados: z.input<typeof faturaAvulsaSchema>,
  opcoes: Opcoes = {},
): Promise<{ faturaId: string; enviada: boolean; erro?: string }> {
  const database = opcoes.database ?? getDb();
  await exigirAcessoPlataforma(userId, "financeiro.gerenciar", database);
  const d = faturaAvulsaSchema.parse(dados);
  const gateway = opcoes.gateway ?? gatewayDaPlataforma();
  const { rows } = await executar(
    userId,
    sql`select app_plataforma_fatura_avulsa(${z.uuid().parse(tenantId)}, ${JSON.stringify(d.itens)}::jsonb, ${d.vencimento}::date, ${gateway.ambiente}, ${d.observacao}) as id`,
    database,
  );
  const faturaId = (rows[0] as { id: string }).id;
  const r = await enviarFatura(tenantId, faturaId, gateway, database);
  return { faturaId, enviada: r.enviada, erro: r.erro };
}
