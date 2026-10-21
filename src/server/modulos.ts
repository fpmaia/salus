import { ErroNegocio } from "./erros";

// Módulos ainda em revisão ficam desligados por padrão (ver docs/revisao-produto-2026-10.md).
// Contratos de locação: desligados até a unificação com os acordos financeiros (Fase C);
// hoje o contrato não gera cobrança. Liga com SALUS_CONTRATOS=true (dev/testes).

export function contratosHabilitados(): boolean {
  return process.env.SALUS_CONTRATOS === "true" || process.env.SALUS_CONTRATOS === "1";
}

export function exigirContratosHabilitados() {
  if (!contratosHabilitados()) throw new ErroNegocio("Contratos de locação estão desativados neste ambiente");
}
