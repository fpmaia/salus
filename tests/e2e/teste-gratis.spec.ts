import { expect, test } from "@playwright/test";
import { dados, EMAIL_TRIAL, SENHA } from "./dados";

// Convite trial da plataforma: a pessoa abre o link, entra com o e-mail convidado, cadastra o
// espaço e cai no painel no plano do convite, com o aviso do teste grátis.

test("convite de teste grátis: do link ao painel em teste", async ({ page }) => {
  await page.goto(dados().linkTeste);
  await expect(page.getByText("30 dias grátis no plano Pro")).toBeVisible();
  await page.getByRole("link", { name: "Já tenho conta" }).click();

  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(EMAIL_TRIAL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/teste\//);

  await page.getByRole("link", { name: "Cadastrar meu espaço" }).click();
  await expect(page.getByText("Teste grátis de 30 dias no plano Pro.")).toBeVisible();
  await page.getByLabel("Nome do espaço").fill("Clínica do Teste Grátis");
  await page.getByLabel("CNPJ ou CPF").fill("11222333000181");
  await page.getByRole("button", { name: "Criar espaço" }).click();

  await expect(page).toHaveURL(/\/painel/);
  await expect(page.getByText(/Teste grátis até/).first()).toBeVisible();
  await page.goto("/painel/assinatura");
  await expect(page.getByText(/Plano Pro/).first()).toBeVisible();
  await expect(page.getByText(/Liberado pela equipe Salus no plano Pro/)).toBeVisible();

  // O link já usado não cadastra outro espaço.
  await page.goto(dados().linkTeste);
  await expect(page.getByText("Este convite já foi usado.")).toBeVisible();
});
