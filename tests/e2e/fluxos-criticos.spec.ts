import { expect, test } from "@playwright/test";
import { dados, entrar } from "./dados";

// Fluxos críticos do MVP, de ponta a ponta: login real, Server Actions e Postgres com RLS.

test("profissional reserva uma sala; reservar o mesmo horário de novo é recusado", async ({ page }) => {
  const { amanha } = dados();
  await entrar(page, "profissional");
  await page.goto(`/painel/agenda?data=${amanha}`);

  const formulario = page.locator("form", { has: page.getByRole("button", { name: "Reservar" }) });
  const reservar = async () => {
    await page.locator("#salaId").selectOption({ label: "Sala 1" });
    await page.locator("#data-reserva").fill(amanha);
    await page.locator("#horaInicio").fill("10:00");
    await page.locator("#horaFim").fill("12:00");
    await formulario.getByRole("button", { name: "Reservar" }).click();
  };

  await reservar();
  await expect(formulario.getByText(/Reserva criada para .*10:00–12:00/)).toBeVisible();

  // A sobreposição é barrada pela constraint EXCLUDE do banco.
  await reservar();
  await expect(formulario.getByText("A sala já está reservada nesse horário")).toBeVisible();
});

test("recepção agenda um paciente dentro da reserva do profissional", async ({ page }) => {
  const { amanha, reservaAmanha } = dados();
  await entrar(page, "recepcao");
  await page.goto(`/painel/agenda?data=${amanha}&reserva=${reservaAmanha}`);

  const formulario = page.locator("form", { has: page.getByRole("button", { name: "Agendar" }) });
  await formulario.getByLabel("Paciente").selectOption({ label: "Ana Paciente" });
  await formulario.getByLabel("Início").fill("14:00");
  await formulario.getByLabel("Fim").fill("15:00");
  await formulario.getByLabel("Observação (administrativa)").fill("Primeira consulta");
  await formulario.getByRole("button", { name: "Agendar" }).click();

  // O painel da reserva remonta depois de agendar (a mensagem some): vale a lista de pacientes.
  await expect(page.getByRole("link", { name: "Ana Paciente" }).first()).toBeVisible();
  await expect(page.getByText("Obs.: Primeira consulta")).toBeVisible();
  await page.goto(`/painel/atendimentos?data=${amanha}`);
  await expect(page.getByText("14:00–15:00")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ana Paciente" })).toBeVisible();
});

test("admin fecha o mês anterior e o extrato fica congelado", async ({ page }) => {
  const { profissionalId, competenciaAnterior } = dados();
  await entrar(page, "admin");
  await page.goto(`/painel/financeiro/${profissionalId}?competencia=${competenciaAnterior}`);
  await expect(page.getByText("Competência aberta")).toBeVisible();

  page.once("dialog", (dialogo) => dialogo.accept());
  await page.getByRole("button", { name: /^Fechar / }).click();
  // O formulário some depois do fechamento (junto com a mensagem): vale o estado da página.
  await expect(page.getByText(/Fechado em/)).toBeVisible();

  // 2h de sala a R$ 45/h, lançadas no fechamento a partir da reserva concluída.
  await page.reload();
  await expect(page.getByRole("row", { name: /Locação 2h/ })).toBeVisible();
  await expect(page.getByText(/R\$\s90,00/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Fechar / })).toHaveCount(0);

  await page.goto(`/painel/financeiro?competencia=${competenciaAnterior}`);
  await expect(page.getByRole("row", { name: /Dra\. E2E/ })).toContainText("Fechado");
});

test("cadastro pede a confirmação do e-mail e não entra sem ela", async ({ page }) => {
  const email = `novo.${Date.now()}@e2e.salus.dev`;
  await page.goto("/cadastro");
  await page.waitForLoadState("networkidle");
  await page.locator("#nome").fill("Dono Novo");
  await page.locator("#email").fill(email);
  await page.locator("#senha").fill("senha-forte-123");
  await page.getByRole("button", { name: "Prosseguir com o Cadastro" }).click();
  await expect(page.getByText("Confirme seu e-mail")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Sem confirmar, o login avisa (e reenvia o link) em vez de abrir o painel.
  await page.goto("/entrar");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-forte-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Confirme seu e-mail para entrar/)).toBeVisible();
  await expect(page).toHaveURL(/\/entrar/);
});

test("páginas saem com CSP de nonce e proteção contra iframe, sem violações no console", async ({ page }) => {
  const violacoes: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violacoes.push(m.text());
  });
  const resposta = await page.goto("/entrar");
  const cabecalhos = resposta!.headers();
  expect(cabecalhos["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(cabecalhos["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(cabecalhos["x-frame-options"]).toBe("DENY");
  expect(cabecalhos["x-content-type-options"]).toBe("nosniff");
  // A página hidrata com a CSP ativa (o botão de login responde).
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  expect(violacoes).toEqual([]);
});
