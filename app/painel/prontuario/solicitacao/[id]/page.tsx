import { notFound } from "next/navigation";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ErroNegocio } from "@/src/server/erros";
import { lerSolicitacao } from "@/src/server/prontuario";
import { DocumentoProntuario } from "../../impressao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SolicitacaoProntuarioPage({ params }: PageProps<"/painel/prontuario/solicitacao/[id]">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "prontuario.solicitacao");
  if (!UUID.test(id)) notFound();
  const dados = await lerSolicitacao(ctx, id).catch((erro) => {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  });
  return <DocumentoProntuario {...dados} tenantNome={ctx.tenantNome} emitidoPor={`${ctx.usuario.nome} (administração)`} />;
}
