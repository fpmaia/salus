import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { withUser } from "../db/tenant";
import { emTeste, statusParaExibir } from "../domain/cobranca";
import { competenciaDe } from "../domain/financeiro";
import { resumoFinanceiro } from "../domain/painel-financeiro";
import { hojeNoFuso, somarDias } from "../domain/tempo";
import { previaDaFatura, situacaoDaClinica } from "./assinatura";
import { exigirAcessoPlataforma, listarClinicasPlataforma } from "./plataforma";

// Painel financeiro e alertas da plataforma: faturas de todas as clínicas, MRR pela próxima
// fatura estimada (com condições e descontos), inadimplência por faixa e quem está perto de
// ser suspenso. Agregação pura em domain/painel-financeiro.ts.

export type FaturaPlataforma = {
  id: string;
  tenantId: string;
  tenantNome: string;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  status: string;
  tipo: "mensal" | "avulsa" | "parcela_acordo";
  formaBaixa: "gateway" | "manual" | "isenta" | null;
  observacao: string | null;
  invoiceUrl: string | null;
  asaasPaymentId: string | null;
  ultimoErro: string | null;
  pagoEm: Date | null;
  itens: { tipo: string; descricao: string; quantidade: number; valorTotalCentavos: number }[];
};

export async function listarFaturasPlataforma(userId: string, limite = 2000, database?: Database, agora = new Date()): Promise<FaturaPlataforma[]> {
  await exigirAcessoPlataforma(userId, "ver", database);
  const hoje = hojeNoFuso("America/Sao_Paulo", agora);
  const { rows } = await withUser(
    userId,
    (tx) =>
      tx.execute<{
        id: string;
        tenant_id: string;
        tenant_nome: string;
        competencia: string;
        vencimento: string;
        valor_centavos: number;
        status: string;
        tipo: FaturaPlataforma["tipo"];
        forma_baixa: FaturaPlataforma["formaBaixa"];
        observacao: string | null;
        invoice_url: string | null;
        asaas_payment_id: string | null;
        ultimo_erro: string | null;
        pago_em: string | null;
        itens: FaturaPlataforma["itens"];
      }>(sql`select * from app_plataforma_faturas(${limite})`),
    database,
  );
  return rows.map((r) => {
    const vencimento = String(r.vencimento).slice(0, 10);
    return {
      id: r.id,
      tenantId: r.tenant_id,
      tenantNome: r.tenant_nome,
      competencia: String(r.competencia).slice(0, 10),
      vencimento,
      valorCentavos: Number(r.valor_centavos),
      status: statusParaExibir(r.status, vencimento, hoje),
      tipo: r.tipo,
      formaBaixa: r.forma_baixa,
      observacao: r.observacao,
      invoiceUrl: r.invoice_url,
      asaasPaymentId: r.asaas_payment_id,
      ultimoErro: r.ultimo_erro,
      pagoEm: r.pago_em ? new Date(r.pago_em) : null,
      itens: r.itens,
    };
  });
}

export type FiltrosFaturas = { status?: string; busca?: string; de?: string; ate?: string };

export function filtrarFaturas(faturas: FaturaPlataforma[], filtros: FiltrosFaturas): FaturaPlataforma[] {
  const busca = filtros.busca?.trim().toLowerCase();
  return faturas.filter(
    (f) =>
      (!filtros.status || (filtros.status === "aberta" ? ["pendente", "vencida", "erro"].includes(f.status) : f.status === filtros.status)) &&
      (!busca || f.tenantNome.toLowerCase().includes(busca)) &&
      (!filtros.de || f.vencimento >= filtros.de) &&
      (!filtros.ate || f.vencimento <= filtros.ate),
  );
}

/** Painel financeiro: resumo do mês, MRR estimado, inadimplência e clínicas perto da suspensão. */
export async function obterPainelFinanceiro(userId: string, filtros: FiltrosFaturas = {}, agora = new Date(), database?: Database) {
  const faturas = await listarFaturasPlataforma(userId, 5000, database, agora);
  const clinicas = await listarClinicasPlataforma(userId, database);
  const hoje = hojeNoFuso("America/Sao_Paulo", agora);
  const resumo = resumoFinanceiro(
    faturas.map((f) => ({ ...f, pagoEmData: f.pagoEm ? hojeNoFuso("America/Sao_Paulo", f.pagoEm) : null })),
    hoje,
  );

  // MRR: a fatura do mês de cada clínica ativa fora do teste, como sairia hoje.
  const competencia = competenciaDe(hoje);
  let mrrCentavos = 0;
  let pagantes = 0;
  const ativas = clinicas.filter((c) => c.status === "ativo");
  for (const c of ativas) {
    if (emTeste(c.testeAte, hoje)) continue;
    const previa = await previaDaFatura(c.id, competencia, agora, database);
    if (previa && previa.calculo.valorTotalCentavos > 0) {
      mrrCentavos += previa.calculo.valorTotalCentavos;
      pagantes++;
    }
  }

  // Perto da suspensão: clínicas com fatura vencida, pela carência de cada uma.
  const comAtraso = [...new Set(faturas.filter((f) => f.status === "vencida").map((f) => f.tenantId))];
  const pertoDaSuspensao = [];
  for (const tenantId of comAtraso) {
    const clinica = ativas.find((c) => c.id === tenantId);
    if (!clinica) continue;
    const situacao = await situacaoDaClinica(tenantId, agora, database);
    if (situacao.estado === "em_dia") continue;
    pertoDaSuspensao.push({ tenantId, nome: clinica.nome, ...situacao });
  }
  pertoDaSuspensao.sort((a, b) => ("suspensaoEm" in a && "suspensaoEm" in b ? a.suspensaoEm.localeCompare(b.suspensaoEm) : 0));

  return {
    resumo,
    mrrCentavos,
    pagantes,
    emTeste: ativas.filter((c) => emTeste(c.testeAte, hoje)).length,
    pertoDaSuspensao,
    faturas: filtrarFaturas(faturas, filtros),
  };
}

/** Alertas da visão geral: o que precisa de alguém hoje. */
export async function alertasPlataforma(userId: string, agora = new Date(), database?: Database) {
  const [faturas, clinicas] = await Promise.all([listarFaturasPlataforma(userId, 5000, database, agora), listarClinicasPlataforma(userId, database)]);
  const hoje = hojeNoFuso("America/Sao_Paulo", agora);
  const emSeteDias = somarDias(hoje, 7);
  return {
    faturasComErro: faturas.filter((f) => f.status === "erro"),
    parcelasAtrasadas: faturas.filter((f) => f.tipo === "parcela_acordo" && f.status === "vencida"),
    testesTerminando: clinicas.filter((c) => c.status === "ativo" && c.testeAte && c.testeAte >= hoje && c.testeAte <= emSeteDias),
  };
}
