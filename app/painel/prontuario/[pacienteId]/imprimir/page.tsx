import { notFound } from "next/navigation";
import { exigirModuloNaPagina, exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ErroNegocio } from "@/src/server/erros";
import { exportarProntuario } from "@/src/server/prontuario";
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
  return <DocumentoProntuario {...dados} tenantNome={ctx.tenantNome} emitidoPor={ctx.usuario.nome} />;
}
