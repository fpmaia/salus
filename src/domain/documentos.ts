// Validação de CPF/CNPJ (dígitos verificadores). Domínio puro: sem I/O.

export type TipoDocumento = "cpf" | "cnpj";

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function todosIguais(digitos: string): boolean {
  return /^(\d)\1*$/.test(digitos);
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || todosIguais(cpf)) return false;
  const d1 = digitoVerificador(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || todosIguais(cnpj)) return false;
  const d1 = digitoVerificador(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Identifica o tipo pelo tamanho e valida. Retorna null se inválido. */
export function analisarDocumento(
  valor: string,
): { tipo: TipoDocumento; digitos: string } | null {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) return cpfValido(digitos) ? { tipo: "cpf", digitos } : null;
  if (digitos.length === 14) return cnpjValido(digitos) ? { tipo: "cnpj", digitos } : null;
  return null;
}
