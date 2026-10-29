import type { FiltrosAuditoriaPlataforma } from "@/src/server/plataforma";

const CAMPOS = ["acao", "alvoId", "pessoa", "de", "ate"] as const;

/** Lê os filtros da auditoria da URL (página e exportação CSV usam os mesmos). */
export function filtrosDaAuditoria(parametros: Record<string, string | string[] | undefined>): Omit<FiltrosAuditoriaPlataforma, "limite"> {
  const filtros: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const valor = parametros[campo];
    if (typeof valor === "string" && valor.trim()) filtros[campo] = valor.trim().slice(0, 120);
  }
  return filtros;
}
