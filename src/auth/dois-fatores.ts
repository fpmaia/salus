// Verificação em duas etapas: obrigatória para quem administra (admin do espaço e superadmin da
// plataforma). EXIGIR_2FA_ADMIN=true|false força; sem ela, vale em produção, fora de demonstração.

export const ROTA_CONFIGURAR_2FA = "/seguranca/dois-fatores";

export function exigir2FAParaAdmin(): boolean {
  const explicito = process.env.EXIGIR_2FA_ADMIN;
  if (explicito === "true" || explicito === "1") return true;
  if (explicito === "false" || explicito === "0") return false;
  const demo = process.env.SALUS_DEMO === "true" || process.env.SALUS_DEMO === "1";
  return process.env.NODE_ENV === "production" && !demo;
}

/** Usuário administrador ainda sem 2FA precisa configurar antes de seguir. */
export function precisaConfigurar2FA(usuario: { twoFactorEnabled?: boolean | null }, administra: boolean): boolean {
  return administra && exigir2FAParaAdmin() && !usuario.twoFactorEnabled;
}
