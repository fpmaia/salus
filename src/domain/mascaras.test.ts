import { describe, expect, it } from "vitest";
import { mascaraCep, mascaraCpf, mascaraCpfCnpj, mascaraTelefone, normalizarMoeda } from "./mascaras";

describe("máscaras", () => {
  it("CPF e CNPJ progressivos", () => {
    expect(mascaraCpf("529")).toBe("529");
    expect(mascaraCpf("5299822")).toBe("529.982.2");
    expect(mascaraCpf("52998224725999")).toBe("529.982.247-25");
    expect(mascaraCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascaraCpfCnpj("529.982.247-25")).toBe("529.982.247-25");
  });

  it("telefone fixo, celular e com DDI", () => {
    expect(mascaraTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascaraTelefone("11999990000")).toBe("(11) 99999-0000");
    expect(mascaraTelefone("+55 11 99999-0000")).toBe("(11) 99999-0000");
    expect(mascaraTelefone("11 9")).toBe("(11) 9");
  });

  it("CEP e valor", () => {
    expect(mascaraCep("01310100")).toBe("01310-100");
    expect(normalizarMoeda("1234.5")).toBe("1.234,50");
    expect(normalizarMoeda("45")).toBe("45,00");
    expect(normalizarMoeda("abc")).toBe("abc");
  });
});
