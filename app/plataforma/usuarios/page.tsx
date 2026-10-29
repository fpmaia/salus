import { acessoPlataforma } from "../acesso";
import { listarUsuariosPlataforma } from "@/src/server/plataforma";
import { TabelaUsuariosPlataforma } from "./tabela-usuarios-plataforma";

export default async function PlataformaUsuariosPage() {
  const { usuario, pode } = await acessoPlataforma();
  const usuarios = await listarUsuariosPlataforma(usuario.id);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TabelaUsuariosPlataforma usuarios={usuarios} meuUsuarioId={usuario.id} podeBanir={pode("usuarios.banir")} />
    </main>
  );
}
