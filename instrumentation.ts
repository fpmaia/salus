import type { Instrumentation } from "next";

// Roda uma vez quando o servidor Next.js sobe (não durante o build).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { validarAmbiente } = await import("./src/env");
  validarAmbiente("app");
  const { iniciarMonitoramento } = await import("./src/observabilidade/monitoramento");
  iniciarMonitoramento("app");
}

// Erros de servidor não tratados (render, route handlers, actions, proxy): log + Sentry.
// Vai o template da rota (routePath), nunca o path real, que pode ter token ou ids.
export const onRequestError: Instrumentation.onRequestError = async (erro, request, contexto) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportarErro } = await import("./src/observabilidade/monitoramento");
  const digest = typeof erro === "object" && erro !== null && "digest" in erro ? String(erro.digest) : undefined;
  reportarErro(erro, "erro não tratado no servidor", {
    tags: { rota: contexto.routePath, tipo: contexto.routeType, metodo: request.method },
    extra: { digest, origem: contexto.renderSource },
  });
};
