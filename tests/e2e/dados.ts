import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SENHA = "salus-e2e-123";
export const ARQUIVO_DADOS = "tests/e2e/.dados.json";

export type Papel = "admin" | "recepcao" | "profissional";
export const usuario = (papel: Papel) => `${papel}@e2e.salus.dev`;

/** Ids criados pelo global-setup. */
export type DadosE2E = { profissionalId: string; reservaAmanha: string; amanha: string; competenciaAnterior: string };

export function dados(): DadosE2E {
  return JSON.parse(readFileSync(path.resolve(ARQUIVO_DADOS), "utf-8"));
}

export async function entrar(page: Page, papel: Papel) {
  // O tour de primeiro acesso (modal) cobre o painel; nos fluxos, ele já foi visto.
  await page.addInitScript(() => localStorage.setItem("salus_tutorial_completed_v1", "true"));
  await page.goto("/entrar");
  // O formulário de login é client-side: espera hidratar antes de enviar.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(usuario(papel));
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
}
