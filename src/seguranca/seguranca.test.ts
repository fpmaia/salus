import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarTurnstile } from "../server/turnstile";
import { cabecalhosFixos, politicaDeConteudo } from "./cabecalhos";
import { ipDoCliente } from "./ip";

afterEach(() => vi.unstubAllEnvs());

describe("CSP", () => {
  it("usa o nonce, bloqueia iframe e objetos e só libera eval em dev", () => {
    const prod = politicaDeConteudo("abc123", { dev: false, https: true });
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("upgrade-insecure-requests");
    expect(prod).not.toContain("unsafe-eval");
    const dev = politicaDeConteudo("x", { dev: true, https: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("cabeçalhos fixos impedem iframe e sniffing", () => {
    const mapa = Object.fromEntries(cabecalhosFixos().map((c) => [c.key, c.value]));
    expect(mapa["X-Frame-Options"]).toBe("DENY");
    expect(mapa["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("IP do cliente", () => {
  it("lê o cabeçalho do proxy e ignora cadeias forjáveis", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(ipDoCliente(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(ipDoCliente(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBeNull();
    expect(ipDoCliente(new Headers({ "x-real-ip": "não-é-ip" }))).toBeNull();
    expect(ipDoCliente(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("fora de produção cai em localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(ipDoCliente(new Headers())).toBe("127.0.0.1");
  });
});

describe("Turnstile", () => {
  const resposta = (corpo: unknown, status = 200) => (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

  it("desligado sem segredo; com segredo exige token válido", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verificarTurnstile("", null)).toBe(true);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo");
    expect(await verificarTurnstile("", null)).toBe(false);
    expect(await verificarTurnstile("tok", "203.0.113.7", resposta({ success: true }))).toBe(true);
    expect(await verificarTurnstile("tok", null, resposta({ success: false }))).toBe(false);
    expect(await verificarTurnstile("tok", null, resposta({}, 500))).toBe(false);
  });

  it("falha fechada em erro de rede", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo");
    const quebrado = (async () => {
      throw new Error("rede");
    }) as unknown as typeof fetch;
    expect(await verificarTurnstile("tok", null, quebrado)).toBe(false);
  });
});
