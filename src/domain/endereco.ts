// Endereço brasileiro: formatação e leitura das respostas dos serviços de CEP. Domínio puro.

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export type Endereco = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

/** O que a busca por CEP devolve para preencher o formulário. */
export type EnderecoDoCep = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string };

const limpo = (v: string | null | undefined) => (v ?? "").trim();

export function formatarCep(cep: string | null | undefined): string {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Endereço em uma linha: "Rua X, 123 - Sala 4 - Centro, São Paulo/SP - CEP 01310-100".
 * Partes vazias são omitidas; sem nada preenchido, devolve null.
 */
export function formatarEndereco(e: Endereco): string | null {
  const rua = [limpo(e.logradouro), limpo(e.numero)].filter(Boolean).join(", ");
  const cidadeUf = [limpo(e.cidade), limpo(e.uf).toUpperCase()].filter(Boolean).join("/");
  const local = [limpo(e.bairro), cidadeUf].filter(Boolean).join(", ");
  const cep = limpo(e.cep) ? `CEP ${formatarCep(e.cep)}` : "";
  const texto = [rua, limpo(e.complemento), local, cep].filter(Boolean).join(" - ");
  return texto || null;
}

/** Resposta da BrasilAPI (/api/cep/v2/{cep}). */
export function lerRespostaBrasilApi(json: unknown): EnderecoDoCep | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Record<string, unknown>;
  const cep = String(r.cep ?? "").replace(/\D/g, "");
  const uf = String(r.state ?? "").toUpperCase();
  if (cep.length !== 8 || !UFS.includes(uf)) return null;
  return {
    cep,
    logradouro: String(r.street ?? "").trim(),
    bairro: String(r.neighborhood ?? "").trim(),
    cidade: String(r.city ?? "").trim(),
    uf,
  };
}

/** Resposta do ViaCEP (/ws/{cep}/json/). CEP inexistente vem como { erro: true }. */
export function lerRespostaViaCep(json: unknown): EnderecoDoCep | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Record<string, unknown>;
  if (r.erro) return null;
  const cep = String(r.cep ?? "").replace(/\D/g, "");
  const uf = String(r.uf ?? "").toUpperCase();
  if (cep.length !== 8 || !UFS.includes(uf)) return null;
  return {
    cep,
    logradouro: String(r.logradouro ?? "").trim(),
    bairro: String(r.bairro ?? "").trim(),
    cidade: String(r.localidade ?? "").trim(),
    uf,
  };
}
