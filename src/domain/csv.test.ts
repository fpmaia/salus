import { describe, expect, it } from "vitest";
import { decimalBr, gerarCsv } from "./csv";

const BOM = "﻿";

describe("gerarCsv", () => {
  it("usa ponto e vírgula, BOM e CRLF; aspas quando preciso", () => {
    expect(gerarCsv([["Nome", "Valor"], ['Ana "Dra"; Silva', decimalBr(123456)]])).toBe(`${BOM}Nome;Valor\r\n"Ana ""Dra""; Silva";1234,56\r\n`);
  });

  it("neutraliza fórmulas, mas número negativo continua número", () => {
    expect(gerarCsv([["=HYPERLINK(1)", "-cmd", decimalBr(-500)]])).toBe(`${BOM}'=HYPERLINK(1);'-cmd;-5,00\r\n`);
  });
});
