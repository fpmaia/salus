import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { gravarDimensoesDasTelas } from "./dimensoes";
import { EMAIL, SENHA } from "./seed";

// Capturas do manual do usuário (/manual): uma tela por passo, com o espaço de demonstração do
// seed. Saem em public/manual/telas/ (versionadas e servidas pelo próprio app). O número do
// arquivo segue a seção do manual (0x acesso, 1x admin, 2x recepção, 3x profissional,
// 4x financeiro, 5x notificações, 6x assinatura, 7x paciente, 8x plataforma).

type Papel = keyof typeof EMAIL;
const dados = () => JSON.parse(readFileSync(path.resolve("tests/manual/.dados.json"), "utf-8"));
export const PASTA_TELAS = path.resolve("public/manual/telas");

test.use({ viewport: { width: 1280, height: 820 } });
test.setTimeout(180_000);
test.afterAll(() => gravarDimensoesDasTelas());

async function foto(page: Page, nome: string, opcoes: { inteira?: boolean } = {}) {
  await page.waitForLoadState("networkidle");
  await page.locator(".animate-pulse").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(PASTA_TELAS, `${nome}.png`), fullPage: opcoes.inteira ?? false });
}

export async function entrar(page: Page, papel: Papel) {
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(EMAIL[papel]);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel|\/plataforma|\/onboarding/);
}

test("acesso", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(EMAIL.admin);
  await foto(page, "01-entrar");
  await page.goto(dados().linkConvite);
  await foto(page, "02-convite");
  await page.goto("/cadastro");
  await foto(page, "04-cadastro");
});

test("admin", async ({ page }) => {
  const d = dados();
  await entrar(page, "admin");
  await foto(page, "10-admin-inicio", { inteira: true });
  await page.goto("/painel/unidades");
  await foto(page, "11-unidades", { inteira: true });
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
  await page.goto("/painel/fiscal");
  await foto(page, "43-notas-fiscais", { inteira: true });
  await page.goto("/painel/notificacoes");
  await foto(page, "50-notificacoes", { inteira: true });
  await page.goto("/painel/assinatura");
  await foto(page, "60-assinatura", { inteira: true });
  await page.getByText("Módulo de Prontuário Eletrônico (EHR)").scrollIntoViewIfNeeded();
  await foto(page, "61-licencas-prontuario");
  await page.getByRole("button", { name: "Fazer upgrade" }).first().scrollIntoViewIfNeeded();
  await foto(page, "62-planos");
  await page.goto("/painel/perfil");
  await foto(page, "03-perfil", { inteira: true });
});

test("recepção", async ({ page }) => {
  const d = dados();
  await entrar(page, "recepcao");
  await foto(page, "20-recepcao-inicio", { inteira: true });
  await page.goto(`/painel/agenda?data=${d.hoje}`);
  await foto(page, "21-agenda-salas", { inteira: true });

  // Clique num horário livre: o modal agenda o paciente e reserva a sala juntos.
  await page.goto(`/painel/agenda?data=${d.amanha}`);
  await page.getByRole("link", { name: "Agendar em Consultório 2 às 09:00" }).click();
  const modal = page.getByRole("dialog", { name: "Novo Agendamento" });
  await modal.getByLabel("Médico / Profissional").selectOption({ label: "Dr. Rafael Lima" });
  await modal.getByRole("combobox", { name: "Paciente" }).fill("Elisa");
  await modal.getByRole("option", { name: /Elisa Prado/ }).click();
  await foto(page, "22-agendar-modal");
  await modal.getByRole("button", { name: "Fechar" }).click();

  // Clique numa consulta: detalhes com check-in, falta, valor e remarcar.
  await page.goto(`/painel/agenda?data=${d.hoje}`);
  await page.locator("[data-agendamento]", { hasText: "Elisa Prado" }).click();
  await foto(page, "23-detalhes-consulta");
  await page.getByRole("dialog", { name: "Detalhes da Consulta" }).getByRole("button", { name: "Alterar horário" }).click();
  await foto(page, "25-remarcar");

  await page.goto(`/painel/agenda?data=${d.hoje}&visao=lista`);
  await foto(page, "24-consultas-do-dia", { inteira: true });
  await page.goto("/painel/pacientes");
  await foto(page, "26-pacientes");
  await page.goto(`/painel/pacientes/${d.paciente}`);
  await foto(page, "27-paciente", { inteira: true });
  await page.goto("/painel/espera");
  await foto(page, "28-lista-espera", { inteira: true });
});

test("profissional", async ({ page }) => {
  const d = dados();
  await entrar(page, "profissional");
  await foto(page, "30-profissional-inicio", { inteira: true });

  await page.goto(`/painel/agenda?data=${d.amanha}`);
  await page.getByRole("link", { name: "Agendar em Consultório 2 às 08:00" }).click();
  const modal = page.getByRole("dialog", { name: "Novo Agendamento" });
  await modal.getByRole("button", { name: "Apenas Reservar Sala" }).click();
  await modal.locator("#reserva-fim").fill("12:00");
  await expect(modal.getByText(/Valor estimado/)).toBeVisible();
  await foto(page, "31-reservar-sala");
  await modal.getByRole("button", { name: "Fechar" }).click();

  await page.goto("/painel/contratos");
  await foto(page, "32-meu-contrato", { inteira: true });
  await page.goto(`/painel/extrato?competencia=${d.competenciaAnterior}`);
  await foto(page, "33-meu-extrato", { inteira: true });
  await page.goto(`/painel/atendimentos/${d.atendimentoPago}/recibo`);
  await foto(page, "34-recibo");
  await page.goto("/painel/prontuario");
  await foto(page, "36-prontuario-lista");
  await page.goto(`/painel/prontuario/${d.carla}`);
  await foto(page, "37-prontuario-paciente", { inteira: true });
  await page.goto("/painel/agendamento-online");
  await foto(page, "38-agenda-online", { inteira: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/painel/agenda?data=${d.hoje}`);
  await foto(page, "35-meu-dia-celular");
});

test("paciente", async ({ page }) => {
  const d = dados();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(d.linkPaciente);
  await foto(page, "70-link-paciente", { inteira: true });
  await page.goto(`/agendar/${d.slugHelena}`);
  await foto(page, "71-agendar-online", { inteira: true });
});

test("espaço com fatura em atraso", async ({ page }) => {
  await entrar(page, "atraso");
  await foto(page, "65-espaco-suspenso");
});

test("plataforma (superadmin)", async ({ page }) => {
  await entrar(page, "superadmin");
  await page.goto("/plataforma");
  await foto(page, "80-plataforma", { inteira: true });
  await page.goto("/plataforma/clinicas");
  await foto(page, "81-plataforma-clinicas", { inteira: true });
  await page.goto("/plataforma/planos");
  await foto(page, "82-plataforma-planos", { inteira: true });
  await page.goto("/plataforma/financeiro");
  await foto(page, "83-plataforma-financeiro", { inteira: true });
  await page.goto("/plataforma/auditoria");
  await foto(page, "84-plataforma-auditoria");
});
