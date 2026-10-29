import { exigirUsuario } from "@/src/auth/sessao";
import { decimalBr, gerarCsv } from "@/src/domain/csv";
import { filtrarFaturas, listarFaturasPlataforma } from "@/src/server/plataforma-painel";

// Exportação das faturas da plataforma com os filtros da tela.
export async function GET(request: Request) {
  const usuario = await exigirUsuario();
  const p = new URL(request.url).searchParams;
  const v = (k: string) => p.get(k)?.slice(0, 80) || undefined;
  const faturas = filtrarFaturas(await listarFaturasPlataforma(usuario.id, 5000), { status: v("status"), busca: v("busca"), de: v("de"), ate: v("ate") });
  const csv = gerarCsv([
    ["clinica", "competencia", "tipo", "vencimento", "valor", "situacao", "forma_baixa", "pago_em", "asaas_id", "observacao"],
    ...faturas.map((f) => [
      f.tenantNome,
      f.competencia,
      f.tipo,
      f.vencimento,
      decimalBr(f.valorCentavos),
      f.status,
      f.formaBaixa,
      f.pagoEm ? f.pagoEm.toISOString() : null,
      f.asaasPaymentId,
      f.observacao,
    ]),
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="faturas-plataforma-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
