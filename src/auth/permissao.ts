import { notFound } from "next/navigation";
import { pode, type Permissao, type Role } from "../domain/rbac";

/** Páginas restritas respondem 404 para quem não tem a permissão (não revela que existem). */
export function exigirPermissaoNaPagina(role: Role, permissao: Permissao): void {
  if (!pode(role, permissao)) notFound();
}

/** Módulo opcional desligado no espaço: a página responde 404, como se não existisse. */
export async function exigirModuloNaPagina(ctx: import("../db/tenant").ContextoTenant, modulo: import("../server/modulos").Modulo) {
  const { modulosDoEspaco } = await import("../server/modulos");
  if (!(await modulosDoEspaco(ctx))[modulo]) notFound();
}
