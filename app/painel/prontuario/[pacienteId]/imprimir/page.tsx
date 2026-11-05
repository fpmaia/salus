import { notFound } from "next/navigation";
import { exigirModuloNaPagina, exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ErroNegocio } from "@/src/server/erros";
import { exportarProntuario } from "@/src/server/prontuario";
import { timbradoDoUsuario } from "@/src/server/documentos-personalizados";
import { DocumentoProntuario } from "../../impressao";

export default async function ImprimirProntuarioPage({ params }: PageProps<"/painel/prontuario/[pacienteId]/imprimir">) {
  const { pacienteId } = await params;
  const ctx = await obterContextoTenant();
  await exigirModuloNaPagina(ctx, "prontuario");
  exigirPermissaoNaPagina(ctx.role, "prontuario.proprio");
  const dados = await exportarProntuario(ctx, pacienteId).catch((erro) => {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  });
  const timbrado = await timbradoDoUsuario(ctx);
  return <DocumentoProntuario {...dados} timbrado={timbrado} tenantNome={ctx.tenantNome} emitidoPor={ctx.usuario.nome} />;
}
