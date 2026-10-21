import { obterContextoTenant } from "@/src/auth/sessao";
import { decimalBr, gerarCsv } from "@/src/domain/csv";
import { formatarCpfCnpj } from "@/src/domain/documentos";
import { ROTULOS_MODELO } from "@/src/domain/financeiro";
import { mensagemDeErro } from "@/src/server/erros";
import { competenciaSchema, resumoCompetencia } from "@/src/server/financeiro";

// Resumo do mês por profissional em CSV (contabilidade). Admin e recepção (financeiro.ver).
export async function GET(request: Request) {
  const ctx = await obterContextoTenant();
  const competencia = new URL(request.url).searchParams.get("competencia") ?? "";
  try {
    const c = competenciaSchema.parse(competencia);
    const linhas = await resumoCompetencia(ctx, c);
    const csv = gerarCsv([
      ["Profissional", "CPF/CNPJ", "Contrato", "Débitos do mês (R$)", "Créditos do mês (R$)", "Saldo acumulado (R$)", "Mês"],
      ...linhas.map((p) => [
        p.nome,
        p.documento ? formatarCpfCnpj(p.documento) : null,
        p.modelo ? ROTULOS_MODELO[p.modelo] : "Sem contrato",
        decimalBr(p.debitos),
        decimalBr(p.creditos),
        decimalBr(p.saldoAcumulado),
        p.fechado ? "Fechado" : "Aberto",
      ]),
    ]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fechamento-${c.slice(0, 7)}.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return Response.json({ erro: mensagem }, { status: 400 });
    throw erro;
  }
}
