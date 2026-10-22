import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { EMAIL, SENHA } from "./seed";

// Capturas do manual do usuário: uma tela por passo, com o espaço de demonstração do seed.
// O número do arquivo segue a seção do manual (1x admin, 2x recepção, 3x profissional…).

type Papel = keyof typeof EMAIL;
const dados = () => JSON.parse(readFileSync(path.resolve("tests/manual/.dados.json"), "utf-8"));
const PASTA = path.resolve("tests/manual/telas");

test.use({ viewport: { width: 1280, height: 820 } });

async function foto(page: Page, nome: string, opcoes: { inteira?: boolean } = {}) {
  await page.waitForLoadState("networkidle");
  await page.locator(".animate-pulse").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: opcoes.inteira ?? false });
}

async function entrar(page: Page, papel: Papel) {
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(EMAIL[papel]);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
}

test("acesso", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL.admin);
  await foto(page, "01-entrar");
  await page.goto(dados().linkConvite);
  await foto(page, "02-convite");
});

test("admin", async ({ page }) => {
  const d = dados();
  await entrar(page, "admin");
  await foto(page, "10-admin-inicio", { inteira: true });
  await page.goto("/painel/unidades");
  await foto(page, "11-unidades");
  await page.goto(`/painel/unidades/${d.unidade}`);
  await foto(page, "12-unidade", { inteira: true });
  await page.goto("/painel/profissionais");
  await foto(page, "13-profissionais", { inteira: true });
  await page.goto("/painel/contratos");
  await foto(page, "14-contratos");
  await page.goto("/painel/contratos/novo");
  await foto(page, "15-contrato-novo", { inteira: true });
  await page.goto("/painel/equipe");
  await foto(page, "16-equipe", { inteira: true });
  await page.goto("/painel/financeiro");
  await foto(page, "40-financeiro", { inteira: true });
  await page.goto(`/painel/financeiro/${d.helena}?competencia=${d.competenciaAnterior}`);
  await foto(page, "41-financeiro-profissional", { inteira: true });
  await page.goto(`/painel/financeiro/fechamento?competencia=${d.competenciaAnterior}`);
  await foto(page, "42-fechamento-pdf");
  await page.goto("/painel/notificacoes");
  await foto(page, "50-notificacoes", { inteira: true });
  await page.goto("/painel/assinatura");
  await foto(page, "60-assinatura", { inteira: true });
  await page.goto("/painel/perfil");
  await foto(page, "03-perfil", { inteira: true });
});

test("recepção", async ({ page }) => {
  const d = dados();
  await entrar(page, "recepcao");
  await foto(page, "20-recepcao-inicio", { inteira: true });
  await page.goto(`/painel/agenda?data=${d.hoje}`);
  await foto(page, "21-agenda-salas", { inteira: true });
  await page.goto(`/painel/agenda?data=${d.amanha}&nova=${d.c2}&inicio=09:00`);
  const cartao = page.locator(`[data-slot="card"]`, { hasText: "Agendar paciente neste horário" });
  await cartao.getByLabel("Profissional").selectOption({ label: "Dr. Rafael Lima" });
  await cartao.getByRole("combobox", { name: "Paciente" }).fill("Elisa");
  await cartao.getByRole("option", { name: /Elisa Prado/ }).click();
  await cartao.scrollIntoViewIfNeeded();
  await foto(page, "22-agendar-um-passo");
  await page.goto(`/painel/atendimentos?data=${d.hoje}`);
  await foto(page, "23-consultas-do-dia", { inteira: true });
  await page.locator("summary", { hasText: "Remarcar" }).first().click();
  await foto(page, "24-remarcar");
  await page.goto("/painel/pacientes");
  await foto(page, "25-pacientes");
  await page.goto(`/painel/pacientes/${d.paciente}`);
  await foto(page, "26-paciente", { inteira: true });
  await page.goto("/painel/espera");
  await foto(page, "27-lista-espera", { inteira: true });
});

test("profissional", async ({ page }) => {
  const d = dados();
  await entrar(page, "profissional");
  await foto(page, "30-profissional-inicio", { inteira: true });
  await page.goto(`/painel/agenda?data=${d.amanha}`);
  await page.locator("#salaId").selectOption({ label: "Consultório 2" });
  await page.locator("#data-reserva").fill(d.amanha);
  await page.locator("#horaInicio").fill("08:00");
  await page.locator("#horaFim").fill("12:00");
  await expect(page.getByText(/Valor estimado/)).toBeVisible();
  await page.getByText(/Valor estimado/).click();
  await foto(page, "31-reservar-sala");
  await page.goto("/painel/contratos");
  await foto(page, "32-meu-contrato", { inteira: true });
  await page.goto(`/painel/extrato?competencia=${d.competenciaAnterior}`);
  await foto(page, "33-meu-extrato", { inteira: true });
  await page.goto(`/painel/atendimentos/${d.atendimentoPago}/recibo`);
  await foto(page, "34-recibo");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/painel/agenda?data=${d.hoje}`);
  await foto(page, "35-meu-dia-celular");
});

test("paciente", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(dados().linkPaciente);
  await foto(page, "70-link-paciente", { inteira: true });
});
