import type { SituacaoContrato } from "@/src/server/contratos";

export const ROTULO_SITUACAO: Record<SituacaoContrato, string> = { vigente: "Vigente", futuro: "A partir de", encerrado: "Encerrado" };
export const COR_SITUACAO: Record<SituacaoContrato, string> = {
  vigente: "bg-emerald-600/15 text-emerald-700",
  futuro: "bg-primary/15 text-primary",
  encerrado: "bg-muted text-muted-foreground",
};
