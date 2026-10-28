import { expect, test, type Page } from "@playwright/test";
import { entrar, type Papel } from "./dados";

// Controle de acesso por papel, de ponta a ponta: o menu mostra só o que o papel pode usar e
// as páginas restritas mostram a tela de não encontrado/acesso restrito (não revelam o conteúdo).
// Roda antes de fluxos-criticos, que ativa o 2FA da recepção.

const MENU: Record<Papel, { ve: string[]; naoVe: string[] }> = {
  admin: {
    ve: ["/painel/agenda", "/painel/pacientes", "/painel/financeiro", "/painel/contratos", "/painel/unidades", "/painel/profissionais", "/painel/equipe", "/painel/assinatura"],
    naoVe: ["/painel/extrato"],
  },
  recepcao: {
    ve: ["/painel/agenda", "/painel/pacientes", "/painel/espera", "/painel/financeiro", "/painel/profissionais"],
    naoVe: ["/painel/unidades", "/painel/equipe", "/painel/assinatura", "/painel/extrato", "/painel/notificacoes"],
  },
  profissional: {
    ve: ["/painel/agenda", "/painel/pacientes", "/painel/extrato", "/painel/contratos"],
    naoVe: ["/painel/espera", "/painel/financeiro", "/painel/unidades", "/painel/profissionais", "/painel/assinatura"],
  },
};

const PROIBIDAS: Record<Papel, string[]> = {
  admin: ["/painel/extrato"],
  recepcao: ["/painel/unidades", "/painel/assinatura", "/painel/notificacoes", "/painel/contratos/novo", "/painel/extrato"],
  profissional: ["/painel/financeiro", "/painel/unidades", "/painel/profissionais", "/painel/assinatura", "/painel/espera", "/painel/notificacoes"],
};

async function restrita(page: Page, rota: string) {
  await page.goto(rota);
  await expect(page.getByText("Página não encontrada ou Acesso Restrito"), rota).toBeVisible();
}

for (const papel of ["admin", "recepcao", "profissional"] as const) {
  test(`${papel}: menu e páginas restritas`, async ({ page }) => {
    await entrar(page, papel);
    const menu = page.getByRole("navigation", { name: "Menu principal" }).first();
    for (const href of MENU[papel].ve) await expect(menu.locator(`a[href="${href}"]`), href).toHaveCount(1);
    for (const href of MENU[papel].naoVe) await expect(menu.locator(`a[href="${href}"]`), href).toHaveCount(0);
    for (const rota of PROIBIDAS[papel]) await restrita(page, rota);
  });
}

test("equipe: só o admin gerencia; os outros veem o aviso de área restrita", async ({ page }) => {
  await entrar(page, "profissional");
  await page.goto("/painel/equipe");
  await expect(page.getByText("Área Restrita aos Administradores")).toBeVisible();
});

test("módulos desligados (padrão) não aparecem no menu e as páginas ficam restritas", async ({ page }) => {
  await entrar(page, "admin");
  const menu = page.getByRole("navigation", { name: "Menu principal" }).first();
  for (const rota of ["/painel/prontuario", "/painel/fiscal", "/painel/agendamento-online"]) {
    await expect(menu.locator(`a[href="${rota}"]`)).toHaveCount(0);
    await restrita(page, rota);
  }
});

test("o botão Manual do painel abre a seção da tela atual", async ({ page }) => {
  await entrar(page, "admin");
  for (const [rota, secao] of [
    ["/painel/agenda", "agenda"],
    ["/painel/financeiro", "financeiro"],
    ["/painel/assinatura", "planos"],
  ] as const) {
    await page.goto(rota);
    await expect(page.getByRole("link", { name: "Ajuda desta tela" })).toHaveAttribute("href", `/manual#${secao}`);
  }
  await page.goto("/manual#planos");
  await expect(page.getByRole("heading", { name: "Planos, limites e excedentes" })).toBeVisible();
});
