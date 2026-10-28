// Máscaras de digitação (CPF, CNPJ, telefone, CEP e valor). Domínio puro: sem I/O.
// O servidor aceita o valor com ou sem máscara; aqui é só para quem digita.

import { lerMoeda } from "./dinheiro";

const digitos = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

/** Aplica um padrão ("000.000.000-00") aos dígitos, até onde eles forem. */
function aplicar(d: string, padrao: string): string {
  let saida = "";
  let i = 0;
  for (const c of padrao) {
    if (i >= d.length) break;
    if (c === "0") saida += d[i++];
    else saida += c;
  }
  return saida;
}

export function mascaraCpf(v: string): string {
  return aplicar(digitos(v, 11), "000.000.000-00");
}

export function mascaraCpfCnpj(v: string): string {
  const d = digitos(v, 14);
  return d.length <= 11 ? aplicar(d, "000.000.000-00") : aplicar(d, "00.000.000/0000-00");
}

/** (11) 9999-9999 ou (11) 99999-9999; o DDI 55 digitado na frente é ignorado. */
export function mascaraTelefone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  return aplicar(d, d.length > 10 ? "(00) 00000-0000" : "(00) 0000-0000");
}

export function mascaraCep(v: string): string {
  return aplicar(digitos(v, 8), "00000-000");
}

/** Ao digitar: formata dígitos como moeda brasileira em tempo real ("15000" → "150,00"). */
export function mascaraMoeda(v: string): string {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  const num = parseInt(d, 10);
  if (isNaN(num)) return "";
  return (num / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ao sair do campo: "1234.5" / "1.234,5" → "1.234,50". Texto inválido fica como está (o servidor avisa). */
export function normalizarMoeda(v: string): string {
  const centavos = lerMoeda(v);
  if (centavos === null) return v;
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const MASCARAS = { cpf: mascaraCpf, cpfCnpj: mascaraCpfCnpj, telefone: mascaraTelefone, cep: mascaraCep, moeda: mascaraMoeda } as const;
export type TipoMascara = keyof typeof MASCARAS;
