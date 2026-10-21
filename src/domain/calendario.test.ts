import { describe, expect, it } from "vitest";
import { gerarIcs, linkDoMapa } from "./calendario";

describe("gerarIcs", () => {
  const ics = gerarIcs({
    uid: "abc@salus",
    inicio: new Date("2030-03-05T13:00:00Z"),
    fim: new Date("2030-03-05T14:00:00Z"),
    titulo: "Consulta com Dra. Ana",
    local: "Centro, Rua das Flores; 100",
    descricao: "Coworking Saúde\nConfirme pelo link",
    geradoEm: new Date("2030-03-01T10:00:00Z"),
  });

  it("evento em UTC com CRLF, alarme e texto escapado", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20300305T130000Z\r\n");
    expect(ics).toContain("DTEND:20300305T140000Z\r\n");
    expect(ics).toContain("LOCATION:Centro\\, Rua das Flores\\; 100\r\n");
    expect(ics).toContain("DESCRIPTION:Coworking Saúde\\nConfirme pelo link\r\n");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("dobra linhas longas", () => {
    const longo = gerarIcs({ uid: "x", inicio: new Date(0), fim: new Date(1), titulo: "A".repeat(200), geradoEm: new Date(0) });
    for (const linha of longo.split("\r\n")) expect(Buffer.byteLength(linha, "utf8")).toBeLessThanOrEqual(75);
  });

  it("link do mapa com o endereço codificado", () => {
    expect(linkDoMapa("Rua das Flores, 100")).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20100");
  });
});
