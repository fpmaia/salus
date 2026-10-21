import { beforeAll, describe, expect, it, vi } from "vitest";
import { gerarTokenAgendamento, lerTokenAgendamento } from "./links";

const TENANT = "11111111-1111-4111-8111-111111111111";
const AGENDAMENTO = "22222222-2222-4222-8222-222222222222";
const expira = new Date("2030-03-05T13:00:00Z");
const antes = new Date("2030-03-04T10:00:00Z");

beforeAll(() => {
  process.env.LINKS_SECRET = "segredo-de-teste-com-32-caracteres!!";
});

describe("links assinados", () => {
  it("ida e volta", () => {
    const token = gerarTokenAgendamento(TENANT, AGENDAMENTO, expira);
    expect(lerTokenAgendamento(token, antes)).toEqual({ tenantId: TENANT, agendamentoId: AGENDAMENTO, expiraEm: expira });
  });

  it("recusa token expirado", () => {
    const token = gerarTokenAgendamento(TENANT, AGENDAMENTO, expira);
    expect(lerTokenAgendamento(token, new Date("2030-03-05T13:00:01Z"))).toBeNull();
  });

  it("recusa token adulterado ou malformado", () => {
    const token = gerarTokenAgendamento(TENANT, AGENDAMENTO, expira);
    const [corpo, assinatura] = token.split(".");
    const outroCorpo = Buffer.from(JSON.stringify({ t: TENANT, a: TENANT, e: 9999999999 })).toString("base64url");
    expect(lerTokenAgendamento(`${outroCorpo}.${assinatura}`, antes)).toBeNull();
    expect(lerTokenAgendamento(`${corpo}.${assinatura.slice(0, -2)}xx`, antes)).toBeNull();
    expect(lerTokenAgendamento("lixo", antes)).toBeNull();
    expect(lerTokenAgendamento(`${corpo}.${assinatura}.extra`, antes)).toBeNull();
  });

  it("assinatura depende do segredo", () => {
    const token = gerarTokenAgendamento(TENANT, AGENDAMENTO, expira);
    process.env.LINKS_SECRET = "outro-segredo-diferente-com-32-chars!";
    expect(lerTokenAgendamento(token, antes)).toBeNull();
    process.env.LINKS_SECRET = "segredo-de-teste-com-32-caracteres!!";
  });

  it("em produção não usa o BETTER_AUTH_SECRET como segredo dos links", () => {
    vi.stubEnv("LINKS_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => gerarTokenAgendamento(TENANT, AGENDAMENTO, expira)).toThrow("Defina LINKS_SECRET");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
