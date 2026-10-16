import { describe, expect, it } from "vitest";
import { analisarDocumento, cnpjValido, cpfValido } from "./documentos";

describe("documentos", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35"])("CPF válido: %s", (cpf) => {
    expect(cpfValido(cpf)).toBe(true);
  });

  it.each(["529.982.247-24", "111.111.111-11", "123", ""])("CPF inválido: %s", (cpf) => {
    expect(cpfValido(cpf)).toBe(false);
  });

  it.each(["11.222.333/0001-81", "11222333000181"])("CNPJ válido: %s", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(true);
  });

  it.each(["11.222.333/0001-80", "00.000.000/0000-00", "1122233300018"])("CNPJ inválido: %s", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(false);
  });

  it("analisarDocumento identifica o tipo e normaliza", () => {
    expect(analisarDocumento("529.982.247-25")).toEqual({ tipo: "cpf", digitos: "52998224725" });
    expect(analisarDocumento("11.222.333/0001-81")).toEqual({ tipo: "cnpj", digitos: "11222333000181" });
    expect(analisarDocumento("123.456.789-00")).toBeNull();
  });
});
