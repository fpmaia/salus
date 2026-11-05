import { lerRespostaBrasilApi, lerRespostaViaCep, type EnderecoDoCep } from "../domain/endereco";

// Busca de endereço pelo CEP, feita no servidor (a CSP do navegador só libera 'self').
// BrasilAPI primeiro, ViaCEP como reserva; resultado em cache de memória por um dia.
// CEP_PROVIDER=simulado (E2E/dev offline) responde só os CEPs de exemplo abaixo.

type Buscar = typeof fetch;

const TEMPO_LIMITE_MS = 4000;
const VALIDADE_CACHE_MS = 86_400_000;
const MAX_CACHE = 2000;

const cache = new Map<string, { valor: EnderecoDoCep | null; expira: number }>();

export const CEPS_SIMULADOS: Record<string, EnderecoDoCep> = {
  "01310100": { cep: "01310100", logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" },
  "20040020": { cep: "20040020", logradouro: "Avenida Rio Branco", bairro: "Centro", cidade: "Rio de Janeiro", uf: "RJ" },
  "69900000": { cep: "69900000", logradouro: "", bairro: "", cidade: "Rio Branco", uf: "AC" },
};

async function consultar(url: string, ler: (json: unknown) => EnderecoDoCep | null, buscar: Buscar) {
  const resposta = await buscar(url, {
    headers: { Accept: "application/json", "User-Agent": "Salus/1.0" },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    cache: "no-store",
  });
  // 404 = CEP inexistente (resposta definitiva); outros erros = serviço fora, tenta o próximo.
  if (resposta.status === 404 || resposta.status === 400) return null;
  if (!resposta.ok) throw new Error(`CEP: HTTP ${resposta.status}`);
  return ler(await resposta.json());
}

/**
 * Endereço do CEP (8 dígitos) ou null se não existir. Lança erro só quando nenhum serviço
 * respondeu: a tela avisa para preencher à mão.
 */
export async function buscarCep(cep: string, buscar: Buscar = fetch, agora = Date.now()): Promise<EnderecoDoCep | null> {
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return null;

  if (process.env.CEP_PROVIDER === "simulado") return CEPS_SIMULADOS[digitos] ?? null;

  const emCache = cache.get(digitos);
  if (emCache && emCache.expira > agora) return emCache.valor;

  const fontes: Array<[string, (json: unknown) => EnderecoDoCep | null]> = [
    [`https://brasilapi.com.br/api/cep/v2/${digitos}`, lerRespostaBrasilApi],
    [`https://viacep.com.br/ws/${digitos}/json/`, lerRespostaViaCep],
  ];
  let ultimoErro: unknown = null;
  for (const [url, ler] of fontes) {
    try {
      const valor = await consultar(url, ler, buscar);
      // "Não encontrado" na BrasilAPI ainda confere no ViaCEP (bases diferentes).
      if (!valor && url.includes("brasilapi")) continue;
      guardar(digitos, valor, agora);
      return valor;
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  if (ultimoErro) throw ultimoErro;
  guardar(digitos, null, agora);
  return null;
}

function guardar(cep: string, valor: EnderecoDoCep | null, agora: number) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(cep, { valor, expira: agora + VALIDADE_CACHE_MS });
}

/** Só para testes. */
export function limparCacheCep() {
  cache.clear();
}
