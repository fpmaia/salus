import { modulosDoEspaco } from "@/src/server/modulos";
import { obterContextoTenant, situacaoDaAssinaturaAtual } from "@/src/auth/sessao";
import { MENSAGEM_SUSPENSO } from "@/src/server/assinatura";
import { LIMITE_ANEXO_BYTES } from "@/src/domain/prontuario";
import { mensagemDeErro } from "@/src/server/erros";
import { anexarArquivo } from "@/src/server/prontuario";

// Upload de anexo clínico (multipart). Autoriza pela sessão; o serviço aplica a RLS clínica,
// cifra o arquivo e confere que o registro é um rascunho do próprio profissional.
export async function POST(request: Request) {
  const ctx = await obterContextoTenant();
  if (!(await modulosDoEspaco(ctx)).prontuario) return new Response(null, { status: 404 });
  if ((await situacaoDaAssinaturaAtual()).estado === "suspensa") return Response.json({ erro: MENSAGEM_SUSPENSO }, { status: 403 });
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_ANEXO_BYTES + 64 * 1024) return Response.json({ erro: "Arquivo maior que 10 MB" }, { status: 413 });
  const formData = await request.formData().catch(() => null);
  const arquivo = formData?.get("arquivo");
  const registroId = formData?.get("registroId");
  if (!(arquivo instanceof File) || typeof registroId !== "string") return Response.json({ erro: "Envie um arquivo" }, { status: 400 });
  try {
    const { id } = await anexarArquivo(ctx, registroId, {
      nome: arquivo.name,
      tipo: arquivo.type,
      dados: Buffer.from(await arquivo.arrayBuffer()),
    });
    return Response.json({ id });
  } catch (erro) {
    const mensagem = mensagemDeErro(erro) ?? (erro instanceof Error && erro.name === "ErroArmazenamento" ? erro.message : null);
    if (mensagem) return Response.json({ erro: mensagem }, { status: 400 });
    throw erro;
  }
}
