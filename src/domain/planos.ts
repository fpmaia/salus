// Planos públicos do Salus (landing, manual). Espelham o seed de planos_saas (migrations 0002 e
// 0040); tests/integration/planos-limites.test.ts confere que continuam iguais ao banco.
// Os planos diferem só em preço, limites, excedentes e preço do prontuário: todos os módulos
// (NFS-e, agenda online, prontuário, WhatsApp, cobrança por PIX) existem em todos os planos.

export type PlanoPublico = {
  codigo: "basico" | "pro" | "enterprise";
  nome: string;
  precoMensalCentavos: number;
  limites: { unidades: number; salas: number; profissionais: number };
  permiteUnidadeExtra: boolean;
  precoSalaExtraCentavos: number;
  precoProfissionalExtraCentavos: number;
  precoUnidadeExtraCentavos: number;
  precoProntuarioCentavos: number;
};

export const PLANOS_PUBLICOS: PlanoPublico[] = [
  {
    codigo: "basico",
    nome: "Básico",
    precoMensalCentavos: 19900,
    limites: { unidades: 1, salas: 5, profissionais: 15 },
    permiteUnidadeExtra: false,
    precoSalaExtraCentavos: 3990,
    precoProfissionalExtraCentavos: 1990,
    precoUnidadeExtraCentavos: 14900,
    precoProntuarioCentavos: 4990,
  },
  {
    codigo: "pro",
    nome: "Pro",
    precoMensalCentavos: 49900,
    limites: { unidades: 3, salas: 20, profissionais: 60 },
    permiteUnidadeExtra: true,
    precoSalaExtraCentavos: 3990,
    precoProfissionalExtraCentavos: 1990,
    precoUnidadeExtraCentavos: 14900,
    precoProntuarioCentavos: 4990,
  },
  {
    codigo: "enterprise",
    nome: "Enterprise",
    precoMensalCentavos: 129900,
    limites: { unidades: 50, salas: 500, profissionais: 2000 },
    permiteUnidadeExtra: true,
    precoSalaExtraCentavos: 3990,
    precoProfissionalExtraCentavos: 1990,
    precoUnidadeExtraCentavos: 14900,
    precoProntuarioCentavos: 3990,
  },
];

export type Simulacao = { plano: PlanoPublico; totalCentavos: number; salasExtras: number; profissionaisExtras: number; unidadesExtras: number };

/** Custo mensal num plano (null se o plano não comporta as unidades). Prontuários pagos pelo espaço. */
export function simularPlano(
  plano: PlanoPublico,
  uso: { unidades: number; salas: number; profissionais: number; prontuarios: number },
): Simulacao | null {
  const unidadesExtras = Math.max(0, uso.unidades - plano.limites.unidades);
  if (unidadesExtras > 0 && !plano.permiteUnidadeExtra) return null;
  const salasExtras = Math.max(0, uso.salas - plano.limites.salas);
  const profissionaisExtras = Math.max(0, uso.profissionais - plano.limites.profissionais);
  const totalCentavos =
    plano.precoMensalCentavos +
    salasExtras * plano.precoSalaExtraCentavos +
    profissionaisExtras * plano.precoProfissionalExtraCentavos +
    unidadesExtras * plano.precoUnidadeExtraCentavos +
    uso.prontuarios * plano.precoProntuarioCentavos;
  return { plano, totalCentavos, salasExtras, profissionaisExtras, unidadesExtras };
}

/** O plano mais barato para o uso informado. */
export function planoMaisBarato(uso: { unidades: number; salas: number; profissionais: number; prontuarios: number }): Simulacao {
  const opcoes = PLANOS_PUBLICOS.map((p) => simularPlano(p, uso)).filter((s): s is Simulacao => s !== null);
  return opcoes.reduce((melhor, s) => (s.totalCentavos < melhor.totalCentavos ? s : melhor));
}
