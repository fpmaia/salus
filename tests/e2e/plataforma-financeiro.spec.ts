import { expect, test } from "@playwright/test";
import { dados, EMAIL_FINANCEIRO_SALUS, EMAIL_SUPORTE_SALUS, entrarNaPlataforma } from "./dados";

// Gestão financeira da plataforma pelo papel: o Financeiro dá desconto e renegocia; o Suporte
// atende a clínica mas não vê nada que mexa em valores.

test("financeiro: desconto na clínica e acordo em 3 parcelas das faturas vencidas", async ({ page }) => {
  const tenant = dados().tenantAtrasada;
  await entrarNaPlataforma(page, EMAIL_FINANCEIRO_SALUS);
  await expect(page.getByText("Financeiro", { exact: true }).first()).toBeVisible();

  await page.goto(`/plataforma/clinicas/${tenant}?aba=cobranca`);
  await page.locator("#ds-valor").fill("15");
  await page.locator("#ds-motivo").fill("Parceria E2E");
  await page.getByRole("button", { name: "Dar desconto" }).click();
  await expect(page.getByText("Desconto criado")).toBeVisible();
  await expect(page.getByText(/Desconto de 15% — Parceria E2E/).first()).toBeVisible();

  await page.goto(`/plataforma/clinicas/${tenant}?aba=acordos`);
  await page.getByText("Renegociar faturas em aberto").click();
  await page.locator(`#ac-desc-${tenant}`).fill("10");
  await page.locator(`#ac-motivo-${tenant}`).fill("Acordo E2E");
  await page.getByRole("button", { name: "Confirmar acordo" }).click();
  // A tela recarrega com o acordo na lista (e sem faturas em aberto para renegociar).
  await expect(page.getByText(/em 3x/)).toBeVisible();
  await expect(page.getByText("Sem faturas em aberto para renegociar.")).toBeVisible();
  await expect(page.getByText(/^3\/3 · vence/)).toBeVisible();
});

test("suporte: suspende e vê a ficha, mas não vê ações de valores", async ({ page }) => {
  const tenant = dados().tenantAtrasada;
  await entrarNaPlataforma(page, EMAIL_SUPORTE_SALUS);
  await page.goto(`/plataforma/clinicas/${tenant}`);
  await expect(page.getByRole("button", { name: "Suspender" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar plano" })).toHaveCount(0);
  await expect(page.getByText("Cancelar conta")).toHaveCount(0);

  await page.goto(`/plataforma/clinicas/${tenant}?aba=cobranca`);
  await expect(page.getByText("Próxima fatura (prévia)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dar desconto" })).toHaveCount(0);
  await expect(page.getByText("Mudar vencimento")).toHaveCount(0);

  await page.goto("/plataforma/equipe");
  await expect(page.getByText("Convidar para a equipe")).toHaveCount(0);
});
