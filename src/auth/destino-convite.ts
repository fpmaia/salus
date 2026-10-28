// Volta para o convite depois de entrar/cadastrar: só aceita um token (nunca URL arbitrária)
// num dos parâmetros conhecidos, cada um com a sua página.
const ROTAS = {
  convite: "/convite/", // profissional (cadastro de profissionais)
  equipe: "/convite-equipe/", // membro da equipe (tela Equipe)
  trial: "/teste/", // teste grátis de clínica (plataforma)
} as const;

export type DestinoConvite = {
  /** Página do convite, para onde a pessoa volta. */
  destino: string;
  /** Mesmo parâmetro, para levar o convite entre /entrar e /cadastro. */
  consulta: string;
};

export function destinoDoConvite(parametros: Record<string, string | string[] | undefined>): DestinoConvite | null {
  for (const [chave, rota] of Object.entries(ROTAS)) {
    const token = parametros[chave];
    if (typeof token === "string" && /^[\w-]{20,100}$/.test(token)) return { destino: `${rota}${token}`, consulta: `${chave}=${token}` };
  }
  return null;
}
