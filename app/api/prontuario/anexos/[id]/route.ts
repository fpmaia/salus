import { modulosDoEspaco } from "@/src/server/modulos";
import { obterContextoTenant } from "@/src/auth/sessao";
import { nomeSeguro } from "@/src/domain/prontuario";
import { mensagemDeErro } from "@/src/server/erros";
import { baixarAnexo } from "@/src/server/prontuario";

// Download de anexo clínico: RLS clínica + decifragem + conferência de integridade + auditoria.
export async function GET(_request: Request, { params }: RouteContext<"/api/prontuario/anexos/[id]">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  if (!(await modulosDoEspaco(ctx)).prontuario) return new Response(null, { status: 404 });
  try {
    const { nome, tipo, dados } = await baixarAnexo(ctx, id);
    return new Response(new Uint8Array(dados), {
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `inline; filename="${nomeSeguro(nome)}"`,
        // Dado de saúde: nada de cache intermediário nem no navegador.
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (erro) {
    const mensagem = mensagemDeErro(erro);
    if (mensagem) return Response.json({ erro: mensagem }, { status: 404 });
    throw erro;
  }
}
