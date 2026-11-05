import { describe, expect, it } from "vitest";
import { aplicarVariaveis, CABECALHO_PADRAO, RODAPE_PADRAO, tipoDaImagem, validarLogo } from "./papel-timbrado";

const dados = {
  clinica: "Clínica Bem Estar",
  profissional: "Dra. Ana Souza",
  especialidade: "Cardiologia",
  conselho: "CRM",
  registro: "12345/SP",
  endereco: "Avenida Paulista, 1000 - São Paulo/SP",
};

describe("aplicarVariaveis", () => {
  it("preenche o cabeçalho padrão", () => {
    expect(aplicarVariaveis(CABECALHO_PADRAO, dados)).toBe("Clínica Bem Estar\nDra. Ana Souza · Cardiologia · CRM 12345/SP");
    expect(aplicarVariaveis(RODAPE_PADRAO, dados)).toBe("Clínica Bem Estar · Avenida Paulista, 1000 - São Paulo/SP");
  });

  it("limpa separadores e linhas sem dados", () => {
    expect(aplicarVariaveis(CABECALHO_PADRAO, { clinica: "Clínica X", profissional: "Dr. João" })).toBe("Clínica X\nDr. João");
    expect(aplicarVariaveis("{email}\n{telefone} | {email}", { clinica: "X" })).toBe("");
    expect(aplicarVariaveis(RODAPE_PADRAO, { clinica: "X" })).toBe("X");
  });

  it("mantém texto fixo e variáveis desconhecidas", () => {
    expect(aplicarVariaveis("Atendimento humanizado\n{outra}", dados)).toBe("Atendimento humanizado\n{outra}");
  });
});

describe("logo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);

  it("reconhece o tipo pelos bytes", () => {
    expect(tipoDaImagem(png)).toBe("image/png");
    expect(tipoDaImagem(jpg)).toBe("image/jpeg");
    expect(tipoDaImagem(webp)).toBe("image/webp");
    expect(tipoDaImagem(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });

  it("valida tamanho e formato", () => {
    expect(validarLogo(png)).toBeNull();
    expect(validarLogo(new Uint8Array())).toBe("Arquivo vazio");
    expect(validarLogo(new Uint8Array(600 * 1024).fill(0x89))).toMatch("500 KB");
    expect(validarLogo(new TextEncoder().encode("GIF89a"))).toMatch("PNG, JPG ou WebP");
  });
});
