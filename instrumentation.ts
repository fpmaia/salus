// Roda uma vez quando o servidor Next.js sobe (não durante o build).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { validarAmbiente } = await import("./src/env");
  validarAmbiente("app");
}
