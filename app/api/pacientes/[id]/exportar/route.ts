import { obterContextoTenant } from "@/src/auth/sessao";
import { mensagemDeErro } from "@/src/server/erros";
import { exportarDadosPaciente } from "@/src/server/titular";

// Exportação dos dados do paciente (LGPD: acesso e portabilidade), em JSON. Só admin; auditada.
export async function GET(_request: Request, { params }: RouteContext<"/api/pacientes/[id]/exportar">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  try {
    const dados = await exportarDadosPaciente(ctx, id);
    return new Response(JSON.stringify(dados, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="paciente-${id.slice(0, 8)}-dados.json"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return Response.json({ erro: mensagem }, { status: 403 });
    throw erro;
  }
}
