import { expect, test, type Page } from "@playwright/test";
import { entrar } from "./dados";

// Planos e módulos pela tela: troca de plano, ligar módulos, licença do prontuário,
// evolução clínica e agendamento online pelo paciente. Roda depois de fluxos-criticos.

const confirmar = (page: Page) => page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }).click();

function emDias(n: number): string {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

test("admin vê uso e preços do plano, sobe para o Pro e volta ao Básico", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/painel/assinatura");
  await expect(page.getByText("Seu plano atual")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Uso do plano" }).or(page.getByText("Uso do plano")).first()).toBeVisible();

  await page.getByRole("button", { name: "Fazer upgrade" }).first().click();
  await confirmar(page);
  await expect(page.getByRole("status").getByText(/os limites já valem/)).toBeVisible();

  await page.getByRole("button", { name: "Mudar para este" }).first().click();
  await confirmar(page);
  await expect(page.getByRole("status").getByText(/os limites já valem/)).toBeVisible();
});

test("admin liga os módulos; o profissional ativa o teste do prontuário e registra uma evolução", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/painel/unidades");
  const modulos = page.locator("form", { has: page.getByRole("button", { name: "Salvar módulos" }) });
  for (const m of ["fiscal", "agendaOnline", "prontuario"]) await modulos.locator(`input[name="${m}"]`).check();
  await modulos.getByRole("button", { name: "Salvar módulos" }).click();
  await expect(page.getByRole("status").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu principal" }).first().locator('a[href="/painel/prontuario"]')).toHaveCount(1);

  await page.context().clearCookies();
  await entrar(page, "profissional");
  await page.goto("/painel/prontuario");
  await expect(page.getByRole("heading", { name: /Prontuário Eletrônico do Salus/ })).toBeVisible();
  await page.getByRole("button", { name: "Começar 15 dias grátis" }).click();
  await expect(page.getByRole("link", { name: "Ana Paciente" })).toBeVisible();

  await page.getByRole("link", { name: "Ana Paciente" }).click();
  await expect(page.getByText("Nova evolução ou relatório clínico")).toBeVisible();
  await page.getByLabel("Evolução / Relatório Clínico").first().fill("Paciente relata melhora do sono.");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  await confirmar(page);
  await expect(page.getByText("Paciente relata melhora do sono.").first()).toBeVisible();
});

test("paciente agenda pela página pública do profissional", async ({ page }) => {
  const dia = emDias(4);
  // O profissional abre horários reservando sala; depois liga a página pública.
  await entrar(page, "profissional");
  await page.goto(`/painel/agenda?data=${dia}`);
  await page.getByRole("link", { name: "Agendar em Sala 2 às 08:00" }).click();
  const modal = page.getByRole("dialog", { name: "Novo Agendamento" });
  await modal.getByRole("button", { name: "Apenas Reservar Sala" }).click();
  await modal.locator("#reserva-fim").fill("10:00");
  await modal.getByRole("button", { name: "Reservar Horário da Sala" }).click();
  await expect(modal).toHaveCount(0);

  await page.goto("/painel/agendamento-online");
  await page.getByLabel("Aceitar agendamentos pela página pública").check();
  await page.getByLabel("Duração da consulta (min)").fill("60");
  await page.getByLabel("Antecedência mínima (horas)").fill("1");
  await page.getByLabel("Até quantos dias à frente").fill("10");
  await page.getByRole("button", { name: "Salvar" }).click();
  const link = page.getByRole("link", { name: /\/agendar\// });
  await expect(link).toBeVisible();
  const url = new URL((await link.getAttribute("href"))!);

  await page.context().clearCookies();
  await page.goto(url.pathname);
  const formulario = page.locator("form", { has: page.getByRole("button", { name: "Agendar" }) });
  await formulario.getByRole("button", { name: new RegExp(dia.slice(8, 10)) }).first().click();
  await formulario.getByText("08:00").click();
  await formulario.getByLabel("Nome completo").fill("Paciente Online");
  await formulario.getByLabel("Celular (WhatsApp)").pressSequentially("11988887777");
  await formulario.getByLabel(/Autorizo o uso do meu nome/).check();
  await formulario.getByRole("button", { name: "Agendar" }).click();
  await expect(page.getByText("Guarde este link para confirmar ou cancelar quando precisar:")).toBeVisible();
});
