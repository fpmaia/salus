import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { AcessoNegado } from "@/components/acesso-negado";
import { listarConvitesPendentes, listarMembrosDaClinica } from "@/src/server/equipe";
import { TabelaEquipe } from "./tabela-equipe";

export default async function EquipePage() {
  const ctx = await obterContextoTenant();

  if (!pode(ctx.role, "membros.gerenciar")) {
    return (
      <AcessoNegado
        titulo="Área Restrita aos Administradores"
        mensagem="Somente administradores deste espaço de saúde podem gerenciar a equipe e convidar membros."
      />
    );
  }

  const [membros, convites] = await Promise.all([
    listarMembrosDaClinica(ctx),
    listarConvitesPendentes(ctx),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TabelaEquipe
        membros={membros}
        convites={convites}
        usuarioAtualId={ctx.userId}
      />
    </main>
  );
}
