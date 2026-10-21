import { expect, test } from "@playwright/test";
import { dados, entrar, SENHA, totp, usuario } from "./dados";

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
    // Antes de reservar, o profissional vê o custo pelo contrato (R$ 45/h × 2h).
    await expect(formulario.getByText(/Valor estimado: R\$\s90,00/)).toBeVisible();
    await formulario.getByRole("button", { name: "Reservar" }).click();
  };

  await reservar();
  // No painel, a confirmação aparece como aviso (sobrevive ao formulário remontar).
  await expect(page.getByRole("status").getByText(/Reserva criada para .*10:00–12:00/)).toBeVisible();

  // A sobreposição é barrada pela constraint EXCLUDE do banco.
  await reservar();
  await expect(formulario.getByText("A sala já está reservada nesse horário")).toBeVisible();
});

test("recepção agenda um paciente dentro da reserva do profissional", async ({ page }) => {
  const { amanha, reservaAmanha } = dados();
  await entrar(page, "recepcao");
  await page.goto(`/painel/agenda?data=${amanha}&reserva=${reservaAmanha}`);

  const formulario = page.locator("form", { has: page.getByRole("button", { name: "Agendar" }) });
  await formulario.getByRole("combobox", { name: "Paciente" }).fill("Ana Pac");
  await formulario.getByRole("option", { name: /Ana Paciente/ }).click();
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
  await expect(page.getByText("Mês em aberto")).toBeVisible();

  await page.getByRole("button", { name: /^Fechar / }).click();
  // Confirmação com o impacto explicado (diálogo da página, não o do navegador).
  await page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }).click();
  // O formulário some depois do fechamento (junto com a mensagem): vale o estado da página.
  await expect(page.getByText(/Fechado em/)).toBeVisible();

  // 2h de sala a R$ 45/h, lançadas no fechamento a partir da reserva concluída.
  await page.reload();
  await expect(page.getByRole("row", { name: /Locação 2h/ })).toBeVisible();
  await expect(page.getByText(/R\$\s90,00/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Fechar / })).toHaveCount(0);

  await page.goto(`/painel/financeiro?competencia=${competenciaAnterior}`);
  await expect(page.getByRole("row", { name: /Dra\. E2E/ })).toContainText("Fechado");

  // Exportação para a contabilidade (CSV para o Excel em português).
  const csv = await page.request.get(`/api/financeiro/fechamento?competencia=${competenciaAnterior}`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toMatch(/Dra\. E2E;.*;90,00;0,00;90,00;Fechado/);
});

test("cadastro pede a confirmação do e-mail e não entra sem ela", async ({ page }) => {
  const email = `novo.${Date.now()}@e2e.salus.dev`;
  await page.goto("/cadastro");
  await page.waitForLoadState("networkidle");
  await page.locator("#nome").fill("Dono Novo");
  await page.locator("#email").fill(email);
  await page.locator("#senha").fill("senha-forte-123");
  await page.getByRole("checkbox", { name: /Li e aceito os Termos de Uso/ }).check();
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

test("health check responde com o banco no ar e sem cache", async ({ request }) => {
  const resposta = await request.get("/api/health");
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["cache-control"]).toBe("no-store");
  expect(await resposta.json()).toMatchObject({ status: "ok", banco: true });
});

test("documentos legais públicos, com versão e contato do encarregado", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible();
  await expect(page.getByText(/Versão de \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "8. Encarregado (DPO)" })).toBeVisible();
  await page.getByRole("link", { name: "Termos de Uso" }).first().click();
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
});

test("recepção ativa a verificação em duas etapas e o login passa a pedir o código", async ({ page }) => {
  await entrar(page, "recepcao");
  await page.goto("/seguranca/dois-fatores");
  await page.getByLabel("Confirme sua senha para começar").fill(SENHA);
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  await expect(page.getByRole("img", { name: "QR code para o app autenticador" })).toBeVisible();
  const segredo = (await page.locator("code").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos que aparece no app").fill(totp(segredo));
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(page.getByText("Guarde estes códigos de recuperação")).toBeVisible();

  // Novo login: depois da senha, a tela do código.
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(usuario("recepcao"));
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/entrar\/dois-fatores/);
  await page.getByLabel("Código").fill(totp(segredo));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
});


test("admin reajusta o contrato pela tela e o histórico mostra as duas versões", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/painel/contratos");
  await page.getByRole("link", { name: /^CTR-/ }).first().click();
  await expect(page.getByText(/por hora reservada/).first()).toBeVisible();

  await page.getByRole("link", { name: "Reajustar (nova versão)" }).click();
  await expect(page.getByRole("heading", { name: /Reajuste do contrato CTR-/ })).toBeVisible();
  await page.getByLabel("Valor da hora (R$)").fill("50,00");
  await page.getByRole("button", { name: "Salvar nova versão" }).click();

  await expect(page.getByText(/Contrato criado/)).toBeVisible();
  await expect(page.getByText(/R\$\s50,00 por hora reservada/).first()).toBeVisible();
  await expect(page.locator("li", { hasText: /→/ }).filter({ hasText: /CTR-/ })).toHaveCount(2);
});

test("equipe agenda em 1 passo com cadastro rápido, desfaz o status e remarca", async ({ page }) => {
  const { amanha, sala1 } = dados();
  // Admin (a recepção já ativou o 2FA no teste anterior); as ações são as mesmas da equipe.
  await entrar(page, "admin");
  // Horário vago clicado na grade: reserva a sala e agenda o paciente juntos.
  await page.goto(`/painel/agenda?data=${amanha}&nova=${sala1}&inicio=17:00`);
  const cartao = page.locator(`[data-slot="card"]`, { hasText: "Agendar paciente neste horário" });
  const formulario = cartao.locator("form");
  await formulario.getByLabel("Profissional").selectOption({ label: "Dra. E2E" });
  await formulario.getByRole("combobox", { name: "Paciente" }).fill("Bruno Rápido");
  await formulario.getByRole("button", { name: "+ Novo paciente “Bruno Rápido”" }).click();
  await formulario.getByLabel("Telefone (WhatsApp)").fill("11 90000-0002");
  await formulario.getByRole("button", { name: "Cadastrar e escolher" }).click();
  await expect(formulario.getByRole("button", { name: "Trocar" })).toBeVisible();
  await formulario.getByRole("button", { name: "Agendar" }).click();
  await expect(page.getByRole("status").getByText(/sala reservada automaticamente/)).toBeVisible();

  await page.goto(`/painel/atendimentos?data=${amanha}`);
  const item = page.getByRole("listitem").filter({ hasText: "17:00–18:00" }).filter({ hasText: "Bruno Rápido" });
  await item.getByRole("button", { name: "Confirmar" }).click();
  await expect(item.getByText("Confirmado", { exact: true })).toBeVisible();

  // Clique errado: desfaz e volta para "Agendado".
  await item.getByRole("button", { name: "Desfazer (voltar a Agendado)" }).click();
  await page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }).click();
  await expect(item.getByText("Agendado", { exact: true })).toBeVisible();

  await item.locator("summary", { hasText: "Remarcar" }).click();
  await item.getByLabel("Nova data").fill(amanha);
  await item.getByLabel("Início").fill("18:00");
  await item.getByLabel("Fim").fill("19:00");
  await item.getByRole("button", { name: "Remarcar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "18:00–19:00" }).filter({ hasText: "Bruno Rápido" })).toBeVisible();
  await expect(page.getByText("17:00–18:00")).toHaveCount(0);
});

test("profissional abre o próprio contrato pelo menu", async ({ page }) => {
  await entrar(page, "profissional");
  await page.getByRole("link", { name: "Meu contrato" }).click();
  await expect(page).toHaveURL(/\/painel\/contratos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /CTR-.* · Dra\. E2E/ })).toBeVisible();
  await expect(page.getByText(/por hora reservada/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Reajustar (nova versão)" })).toHaveCount(0);
});

test("profissional emite o recibo do atendimento pago e a recepção cadastra paciente menor com responsável", async ({ page }) => {
  const { atendimentoPago } = dados();
  await entrar(page, "profissional");
  await page.goto(`/painel/atendimentos/${atendimentoPago}/recibo`);
  await expect(page.getByRole("heading", { name: "Recibo" })).toBeVisible();
  await expect(page.getByText(/Recebi de Ana Paciente, a quantia de R\$\s200,00 \(duzentos reais\)/)).toBeVisible();
  await expect(page.getByText("CRP 06/000001")).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir / Salvar PDF" })).toBeVisible();

  await page.context().clearCookies();
  await entrar(page, "admin");
  await page.goto("/painel/pacientes");
  const novo = page.locator("form", { has: page.getByRole("button", { name: "Cadastrar paciente" }) });
  await novo.getByLabel("Nome", { exact: true }).fill("Lia Criança");
  await novo.getByLabel("Nascimento").fill("2019-04-02");
  await novo.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(novo.getByText("Paciente menor de idade: informe o responsável legal")).toBeVisible();
  await novo.getByText("Responsável, convênio e endereço").click();
  await novo.getByLabel("Nome do responsável").fill("Rui Pai");
  await novo.getByLabel("Parentesco").fill("Pai");
  await novo.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(page.getByRole("link", { name: "Lia Criança" })).toBeVisible();
});

test("máscaras formatam CPF e telefone enquanto o usuário digita", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/painel/pacientes");
  const novo = page.locator("form", { has: page.getByRole("button", { name: "Cadastrar paciente" }) });
  await novo.getByLabel("CPF (opcional)").pressSequentially("52998224725");
  await expect(novo.getByLabel("CPF (opcional)")).toHaveValue("529.982.247-25");
  await novo.getByLabel("Telefone / WhatsApp").pressSequentially("11999990000");
  await expect(novo.getByLabel("Telefone / WhatsApp")).toHaveValue("(11) 99999-0000");
});

test("paciente abre o link: vê o espaço, baixa o evento para a agenda e confirma a presença", async ({ page, request }) => {
  const { linkPaciente } = dados();
  await page.goto(linkPaciente);
  await expect(page.getByText("Coworking E2E")).toBeVisible();
  await expect(page.getByText("Olá, Bia!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver no mapa" })).toHaveAttribute("href", /google\.com\/maps.*Rua%20dos%20Testes/);

  const ics = await request.get(`${linkPaciente}/calendario`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const texto = await ics.text();
  expect(texto).toContain("SUMMARY:Consulta com Dra. E2E");
  expect(texto).toMatch(/DTSTART:\d{8}T180000Z/); // 15h em São Paulo

  await page.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(page.getByText("Confirmada. Até lá!")).toBeVisible();
});

// Por último: o feriado de amanhã bloquearia as reservas dos outros testes.
test("feriado num dia com reservas mostra a lista e só grava com a decisão do admin", async ({ page }) => {
  const { amanha } = dados();
  await entrar(page, "admin");
  await page.goto("/painel/unidades");
  await page.getByRole("link", { name: "Unidade E2E" }).first().click();
  const formulario = page.locator("form", { has: page.getByRole("button", { name: "Adicionar feriado" }) });
  await formulario.getByLabel("Data").fill(amanha);
  await formulario.getByLabel("Descrição").fill("Feriado E2E");
  await formulario.getByRole("button", { name: "Adicionar feriado" }).click();
  await expect(formulario.getByText(/Já há reservas nesse dia: .*Sala 2 · Dra\. E2E/)).toBeVisible();

  await formulario.getByLabel("Se já houver reservas nesse dia").selectOption("manter");
  await formulario.getByRole("button", { name: "Adicionar feriado" }).click();
  await expect(page.getByText("Feriado E2E")).toBeVisible();
});
