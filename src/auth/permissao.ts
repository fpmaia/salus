import { notFound } from "next/navigation";
import { pode, type Permissao, type Role } from "../domain/rbac";

/** Páginas restritas respondem 404 para quem não tem a permissão (não revela que existem). */
export function exigirPermissaoNaPagina(role: Role, permissao: Permissao): void {
  if (!pode(role, permissao)) notFound();
}
