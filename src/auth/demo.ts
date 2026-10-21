// Login de demonstração: só para as contas do seed (src/db/scripts/seed.ts), nunca para
// contas reais nem para o superadmin. Em produção, só com SALUS_DEMO=true (ambiente de demo).

export const SENHA_DEMO = "salus-dev-123";

const CONTAS_DEMO = /^(admin|recepcao|profissional)@(alfa|beta)\.salus\.dev$/;

export function demoHabilitado(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SALUS_DEMO === "true" || process.env.SALUS_DEMO === "1";
}

export function contaDemo(email: string): boolean {
  return CONTAS_DEMO.test(email.trim().toLowerCase());
}
