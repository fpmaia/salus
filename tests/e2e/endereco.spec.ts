import { expect, test } from "@playwright/test";
import { entrar } from "./dados";

// Busca de endereço pelo CEP (CEP_PROVIDER=simulado no servidor de E2E: só CEPs de exemplo).

test("recepção cadastra paciente com endereço preenchido pelo CEP", async ({ page }) => {
  await entrar(page, "recepcao");
  await page.goto("/painel/pacientes");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Nome", { exact: true }).fill("Paciente do CEP");
  await page.getByText("Responsável, convênio e endereço").click();

  // CEP inexistente: avisa e deixa preencher à mão.
  await page.getByLabel("CEP").fill("99999-999");
  await expect(page.getByText("CEP não encontrado. Preencha o endereço manualmente.")).toBeVisible();

  await page.getByLabel("CEP").fill("01310-100");
  await expect(page.getByLabel("Rua / logradouro")).toHaveValue("Avenida Paulista");
  await expect(page.getByLabel("Bairro")).toHaveValue("Bela Vista");
  await expect(page.getByLabel("Cidade")).toHaveValue("São Paulo");
  await expect(page.getByLabel("UF")).toHaveValue("SP");
  await expect(page.getByLabel("Número")).toBeFocused();
  await page.getByLabel("Número").fill("1000");
  await page.getByLabel("Complemento (opcional)").fill("Apto 12");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByText("Paciente cadastrado")).toBeVisible();

  await page.goto("/painel/pacientes?busca=Paciente+do+CEP");
  await page.getByRole("link", { name: /Paciente do CEP/ }).click();
  await expect(page.getByLabel("Rua / logradouro")).toHaveValue("Avenida Paulista");
  await expect(page.getByLabel("Número")).toHaveValue("1000");
  await expect(page.getByLabel("Complemento (opcional)")).toHaveValue("Apto 12");
  await expect(page.getByLabel("CEP")).toHaveValue("01310-100");
});
