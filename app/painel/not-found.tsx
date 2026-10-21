import { AcessoNegado } from "@/components/acesso-negado";

export default function PainelNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center py-12">
      <AcessoNegado
        titulo="Página não encontrada ou Acesso Restrito"
        mensagem="O recurso solicitado não existe ou o seu perfil de usuário atual não tem permissão para acessá-lo nesta clínica."
        voltarHref="/painel"
      />
    </main>
  );
}
