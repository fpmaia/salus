import { afterEach, describe, expect, it, vi } from "vitest";
import { contaDemo, demoHabilitado } from "./demo";

afterEach(() => vi.unstubAllEnvs());

describe("login de demonstração", () => {
  it("só aceita as contas do seed", () => {
    expect(contaDemo("admin@alfa.salus.dev")).toBe(true);
    expect(contaDemo(" Recepcao@BETA.salus.dev ")).toBe(true);
    expect(contaDemo("dono@lscode.com")).toBe(false);
    expect(contaDemo("admin@alfa.salus.dev.evil.com")).toBe(false);
    expect(contaDemo("convidado@alfa.salus.dev")).toBe(false);
  });

  it("em produção só com SALUS_DEMO", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SALUS_DEMO", "");
    expect(demoHabilitado()).toBe(false);
    vi.stubEnv("SALUS_DEMO", "true");
    expect(demoHabilitado()).toBe(true);
  });
});
