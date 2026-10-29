import { cache } from "react";
import { exigirUsuario } from "@/src/auth/sessao";
import { papelPode, type PapelPlataforma, type PermissaoPlataforma } from "@/src/domain/permissoes-plataforma";
import { papelNaPlataforma } from "@/src/server/plataforma";

/** Usuário e papel na equipe Salus, uma vez por requisição (layout e páginas usam o mesmo). */
export const acessoPlataforma = cache(async () => {
  const usuario = await exigirUsuario();
  const papel: PapelPlataforma | null = await papelNaPlataforma(usuario.id);
  return { usuario, papel, pode: (permissao: PermissaoPlataforma) => papelPode(papel, permissao) };
});
