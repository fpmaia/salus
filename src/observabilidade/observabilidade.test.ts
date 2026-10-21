import type { ErrorEvent } from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exigir2FAParaAdmin, precisaConfigurar2FA } from "../auth/dois-fatores";
import { mascararEmail, registrar, serializarErro } from "./log";
import { limparEvento } from "./monitoramento";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("log estruturado", () => {
  it("em produção sai uma linha JSON com nível, serviço e erro serializado", () => {
    vi.stubEnv("NODE_ENV", "production");
    const escrita = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    registrar("error", "job falhou", { fila: "x", erro: new Error("boom", { cause: new Error("raiz") }) });
    const linha = JSON.parse(String(escrita.mock.calls[0][0]));
    expect(linha).toMatchObject({ nivel: "error", msg: "job falhou", fila: "x", erro: { nome: "Error", mensagem: "boom", causa: { mensagem: "raiz" } } });
    expect(typeof linha.ts).toBe("string");
  });

  it("respeita o nível mínimo e mascara e-mails", () => {
    vi.stubEnv("LOG_NIVEL", "warn");
    const escrita = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    registrar("info", "silencioso");
    expect(escrita).not.toHaveBeenCalled();
    expect(mascararEmail("ana.souza@exemplo.com")).toBe("a***@exemplo.com");
    expect(serializarErro("texto")).toEqual({ valor: "texto" });
  });
});

describe("Sentry sem dado pessoal", () => {
  it("o evento sai sem corpo, cookies, cabeçalhos, URL, breadcrumbs e com o usuário só pelo id", () => {
    const evento = limparEvento({
      type: undefined,
      request: { url: "https://app/c/token-secreto", data: '{"nome":"Maria"}', cookies: { s: "1" }, headers: { cookie: "x" }, query_string: "a=1", method: "POST" },
      user: { id: "u1", email: "maria@exemplo.com", ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "Maria" }],
    } as ErrorEvent);
    expect(evento.request).toEqual({ method: "POST" });
    expect(evento.user).toEqual({ id: "u1" });
    expect(evento.breadcrumbs).toBeUndefined();
  });
});

describe("2FA obrigatório para quem administra", () => {
  it("vale em produção fora de demonstração, e pode ser forçado", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SALUS_DEMO", "");
    expect(exigir2FAParaAdmin()).toBe(true);
    expect(precisaConfigurar2FA({ twoFactorEnabled: false }, true)).toBe(true);
    expect(precisaConfigurar2FA({ twoFactorEnabled: true }, true)).toBe(false);
    expect(precisaConfigurar2FA({ twoFactorEnabled: false }, false)).toBe(false);
    vi.stubEnv("SALUS_DEMO", "true");
    expect(exigir2FAParaAdmin()).toBe(false);
    vi.stubEnv("EXIGIR_2FA_ADMIN", "true");
    expect(exigir2FAParaAdmin()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EXIGIR_2FA_ADMIN", "");
    expect(exigir2FAParaAdmin()).toBe(false);
  });
});
