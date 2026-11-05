import { describe, expect, it } from "vitest";
import { formatarCep, formatarEndereco, lerRespostaBrasilApi, lerRespostaViaCep } from "./endereco";

describe("formatarEndereco", () => {
  it("monta a linha completa", () => {
    expect(
      formatarEndereco({
        cep: "01310100",
        logradouro: "Avenida Paulista",
        numero: "1000",
        complemento: "Sala 12",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        uf: "sp",
      }),
    ).toBe("Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100");
  });

  it("omite partes vazias", () => {
    expect(formatarEndereco({ logradouro: "Rua A", cidade: "Recife", uf: "PE" })).toBe("Rua A - Recife/PE");
    expect(formatarEndereco({ logradouro: " ", numero: "" })).toBeNull();
  });

  it("formata o CEP", () => {
    expect(formatarCep("01310100")).toBe("01310-100");
    expect(formatarCep("0131")).toBe("0131");
    expect(formatarCep(null)).toBe("");
  });
});

describe("respostas dos serviços de CEP", () => {
  it("lê a BrasilAPI", () => {
    expect(
      lerRespostaBrasilApi({ cep: "01310100", state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Avenida Paulista" }),
    ).toEqual({ cep: "01310100", logradouro: "Avenida Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" });
    expect(lerRespostaBrasilApi({ name: "CepPromiseError" })).toBeNull();
  });

  it("lê o ViaCEP, inclusive CEP de cidade sem logradouro", () => {
    expect(lerRespostaViaCep({ cep: "69900-000", logradouro: "", bairro: "", localidade: "Rio Branco", uf: "AC" })).toEqual({
      cep: "69900000",
      logradouro: "",
      bairro: "",
      cidade: "Rio Branco",
      uf: "AC",
    });
    expect(lerRespostaViaCep({ erro: "true" })).toBeNull();
    expect(lerRespostaViaCep(null)).toBeNull();
  });
});
