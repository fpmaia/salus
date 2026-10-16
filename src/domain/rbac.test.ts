import { describe, expect, it } from "vitest";
import { ErroPermissao, exigirPermissao, PERMISSOES, pode, ROLES } from "./rbac";

describe("rbac", () => {
  it.each([
    ["admin", "tenant.configurar", true],
    ["recepcao", "tenant.configurar", false],
    ["profissional", "tenant.configurar", false],
    ["recepcao", "pagamentos.baixar", true],
    ["profissional", "pacientes.gerenciar", false],
    ["profissional", "extrato.proprio", true],
    ["admin", "auditoria.ver", true],
    ["recepcao", "auditoria.ver", false],
  ] as const)("%s → %s = %s", (role, permissao, esperado) => {
    expect(pode(role, permissao)).toBe(esperado);
  });

  it("toda permissão referencia apenas papéis conhecidos", () => {
    for (const papeis of Object.values(PERMISSOES)) {
      for (const papel of papeis) expect(ROLES).toContain(papel);
    }
  });

  it("exigirPermissao lança ErroPermissao quando negado", () => {
    expect(() => exigirPermissao("recepcao", "membros.gerenciar")).toThrow(ErroPermissao);
    expect(() => exigirPermissao("admin", "membros.gerenciar")).not.toThrow();
  });
});
