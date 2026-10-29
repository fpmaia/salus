import { describe, expect, it } from "vitest";
import { papelPode, PERMISSOES_PLATAFORMA } from "./permissoes-plataforma";

describe("permissões da equipe da plataforma", () => {
  it("tabela-verdade (mudança aqui precisa mudar app_plataforma_pode também)", () => {
    expect(PERMISSOES_PLATAFORMA).toMatchInlineSnapshot(`
      {
        "clinicas.gerenciar": [
          "dono",
          "suporte",
        ],
        "convites.gerenciar": [
          "dono",
          "financeiro",
        ],
        "equipe.gerenciar": [
          "dono",
        ],
        "financeiro.gerenciar": [
          "dono",
          "financeiro",
        ],
        "planos.editar": [
          "dono",
        ],
        "usuarios.banir": [
          "dono",
        ],
        "ver": [
          "dono",
          "financeiro",
          "suporte",
        ],
      }
    `);
  });

  it("dono pode tudo; suporte não mexe em valores; financeiro não suspende", () => {
    for (const perm of Object.keys(PERMISSOES_PLATAFORMA) as (keyof typeof PERMISSOES_PLATAFORMA)[]) expect(papelPode("dono", perm)).toBe(true);
    expect(papelPode("suporte", "financeiro.gerenciar")).toBe(false);
    expect(papelPode("suporte", "clinicas.gerenciar")).toBe(true);
    expect(papelPode("financeiro", "clinicas.gerenciar")).toBe(false);
    expect(papelPode("financeiro", "equipe.gerenciar")).toBe(false);
    expect(papelPode(null, "ver")).toBe(false);
  });
});
