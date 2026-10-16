import { describe, expect, it } from "vitest";
import { formatarRange, lerRange } from "./range";

describe("range", () => {
  it("formata como intervalo semiaberto", () => {
    expect(
      formatarRange({ inicio: new Date("2026-10-16T11:00:00Z"), fim: new Date("2026-10-16T12:00:00Z") }),
    ).toBe("[2026-10-16T11:00:00.000Z,2026-10-16T12:00:00.000Z)");
  });

  it.each([
    '["2026-10-16 11:00:00+00","2026-10-16 12:00:00+00")',
    '["2026-10-16 08:00:00-03","2026-10-16 09:00:00-03")',
    '["2026-10-16 11:00:00.000+00:00","2026-10-16 12:00:00+00:00")',
  ])("lê a saída do Postgres %s", (valor) => {
    const { inicio, fim } = lerRange(valor);
    expect(inicio.toISOString()).toBe("2026-10-16T11:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-10-16T12:00:00.000Z");
  });
});
