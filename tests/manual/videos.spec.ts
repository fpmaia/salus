import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { EMAIL, SENHA } from "./seed";

// Animações do manual (/manual): roteiros curtos gravados pelo Playwright em WebM, com um
// cursor desenhado na tela para o usuário acompanhar os cliques. Saem em
// public/manual/animacoes/<nome>.webm, com o primeiro quadro em <nome>.png (pôster).
// Roda depois de capturas.spec.ts (ordem alfabética), porque muda os dados do seed.

type Papel = keyof typeof EMAIL;
const dados = () => JSON.parse(readFileSync(path.resolve("tests/manual/.dados.json"), "utf-8"));
const PASTA = path.resolve("public/manual/animacoes");
const TAMANHO = { width: 1280, height: 720 };
const CELULAR = { width: 390, height: 844 };

// Cursor visível + "onda" no clique (a gravação não mostra o ponteiro do sistema).
const CURSOR = `
  window.addEventListener("DOMContentLoaded", () => {
    const estilo = document.createElement("style");
    estilo.textContent = \`
      #salus-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(13, 148, 136, .35); border: 2px solid rgb(13, 148, 136); pointer-events: none; transition: transform .15s; }
      .salus-onda { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        border: 3px solid rgb(13, 148, 136); pointer-events: none; animation: salus-onda .6s ease-out forwards; }
      nextjs-portal { display: none !important; }
      @keyframes salus-onda { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }\`;
    document.head.appendChild(estilo);
    const cursor = document.createElement("div");
    cursor.id = "salus-cursor";
    cursor.style.left = "-50px";
    document.body.appendChild(cursor);
    document.addEventListener("mousemove", (e) => { cursor.style.left = e.clientX + "px"; cursor.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", (e) => {
      cursor.style.transform = "scale(.7)";
      const onda = document.createElement("div");
      onda.className = "salus-onda";
      onda.style.left = e.clientX + "px";
      onda.style.top = e.clientY + "px";
      document.body.appendChild(onda);
      setTimeout(() => onda.remove(), 700);
    }, true);
    document.addEventListener("mouseup", () => { cursor.style.transform = ""; }, true);
  });
`;

async function centro(alvo: Locator) {
  await alvo.scrollIntoViewIfNeeded();
  const caixa = (await alvo.boundingBox())!;
  return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

/** Move o cursor devagar até o alvo e clica (para a animação mostrar o caminho). */
async function clicar(page: Page, alvo: Locator) {
  const { x, y } = await centro(alvo);
  await page.mouse.move(x, y, { steps: 18 });
  await page.waitForTimeout(250);
  await alvo.click();
  await page.waitForTimeout(500);
}

async function digitar(page: Page, alvo: Locator, texto: string) {
  await clicar(page, alvo);
  await alvo.pressSequentially(texto, { delay: 55 });
  await page.waitForTimeout(300);
}

async function gravar(
  browser: Browser,
  baseURL: string,
  nome: string,
  papel: Papel | null,
  roteiro: (page: Page) => Promise<void>,
  viewport = TAMANHO,
) {
  mkdirSync(PASTA, { recursive: true });
  const comum = { baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport };
  let storageState: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>> | undefined;
  if (papel) {
    const login = await browser.newContext(comum);
    const p = await login.newPage();
    await p.goto("/entrar");
    await p.waitForLoadState("networkidle");
    await p.getByLabel("E-mail").fill(EMAIL[papel]);
    await p.getByLabel("Senha").fill(SENHA);
    await p.getByRole("button", { name: "Entrar" }).click();
    await expect(p).toHaveURL(/\/painel/);
    storageState = await login.storageState();
    await login.close();
  }
  const contexto = await browser.newContext({ ...comum, storageState, recordVideo: { dir: path.join(PASTA, ".tmp"), size: viewport } });
  await contexto.addInitScript(CURSOR);
  const page = await contexto.newPage();
  await roteiro(page);
  await page.waitForTimeout(1500);
  const video = page.video()!;
  await contexto.close();
  await video.saveAs(path.join(PASTA, `${nome}.webm`));
  await video.delete();
}

/** Pôster: a tela do primeiro passo, já carregada. */
async function poster(page: Page, nome: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`) });
}

test.setTimeout(120_000);

test("agendar paciente em um passo", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "agendar-paciente", "recepcao", async (page) => {
    await page.goto(`/painel/agenda?data=${d.amanha}`);
    await poster(page, "agendar-paciente");
    await clicar(page, page.getByRole("link", { name: "Agendar em Consultório 2 às 10:00" }));
    const modal = page.getByRole("dialog", { name: "Novo Agendamento" });
    await clicar(page, modal.getByLabel("Médico / Profissional"));
    await modal.getByLabel("Médico / Profissional").selectOption({ label: "Dr. Rafael Lima" });
    await digitar(page, modal.getByRole("combobox", { name: "Paciente" }), "Gabriela");
    await clicar(page, modal.getByRole("option", { name: /Gabriela Torres/ }));
    await clicar(page, modal.getByRole("button", { name: "Confirmar Agendamento" }));
    await expect(modal).toHaveCount(0);
    await page.locator("[data-agendamento]", { hasText: "Gabriela Torres" }).first().scrollIntoViewIfNeeded();
  });
});

test("check-in do paciente", async ({ browser, baseURL }) => {
  const d = dados();
  // O check-in só abre 1h antes: o seed cria uma consulta na próxima hora cheia (fora de 7h–20h, não há).
  test.skip(!d.pacienteCheckin, "Sem consulta na próxima hora (seed rodado fora do horário de funcionamento)");
  await gravar(browser, baseURL!, "check-in", "recepcao", async (page) => {
    await page.goto(`/painel/agenda?data=${d.hoje}`);
    await poster(page, "check-in");
    await clicar(page, page.locator("[data-agendamento]", { hasText: d.pacienteCheckin }));
    const modal = page.getByRole("dialog", { name: "Detalhes da Consulta" });
    await clicar(page, modal.getByRole("button", { name: /Paciente Chegou/ }));
    await expect(modal).toHaveCount(0);
  });
});

test("remarcar arrastando na grade", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "remarcar-arrastando", "recepcao", async (page) => {
    await page.goto(`/painel/agenda?data=${d.amanha}`);
    await poster(page, "remarcar-arrastando");
    const origem = page.locator("[data-agendamento]", { hasText: "Bruno Henrique Dias" });
    const destino = page.getByRole("link", { name: "Agendar em Consultório 1 às 17:00" });
    const a = await centro(origem);
    await page.mouse.move(a.x, a.y, { steps: 18 });
    await page.mouse.down();
    const b = await centro(destino);
    await page.mouse.move(b.x, b.y, { steps: 30 });
    await page.mouse.up();
    await expect(page.getByRole("status").getByText(/Remarcado para/)).toBeVisible();
  });
});

test("profissional reserva sala vendo o valor", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "reservar-sala", "profissional", async (page) => {
    await page.goto(`/painel/agenda?data=${d.amanha}`);
    await poster(page, "reservar-sala");
    await clicar(page, page.getByRole("link", { name: "Agendar em Consultório 2 às 08:00" }));
    const modal = page.getByRole("dialog", { name: "Novo Agendamento" });
    await clicar(page, modal.getByRole("button", { name: "Apenas Reservar Sala" }));
    await clicar(page, modal.locator("#reserva-fim"));
    await modal.locator("#reserva-fim").fill("11:00");
    await expect(modal.getByText(/Valor estimado/)).toBeVisible();
    await page.waitForTimeout(900);
    await clicar(page, modal.getByRole("button", { name: "Reservar Horário da Sala" }));
    await expect(modal).toHaveCount(0);
  });
});

test("evolução no prontuário", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "evolucao-prontuario", "profissional", async (page) => {
    await page.goto(`/painel/prontuario/${d.carla}`);
    await poster(page, "evolucao-prontuario");
    const editor = page.getByLabel("Evolução", { exact: true }).first();
    await digitar(page, editor, "Sessão focada em rotina de sono. Paciente refere boa adesão ao registro diário.");
    await clicar(page, page.getByRole("button", { name: "Criar rascunho" }));
    await clicar(page, page.getByRole("button", { name: "Finalizar" }).last());
    await clicar(page, page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }));
    await expect(page.getByText("Sessão focada em rotina de sono.").first()).toBeVisible();
  });
});

test("documento no prontuário", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "documento-prontuario", "profissional", async (page) => {
    await page.goto(`/painel/prontuario/${d.carla}?aba=documentos`);
    await poster(page, "documento-prontuario");
    await clicar(page, page.getByRole("button", { name: /Declaração de acompanhamento/ }));
    await page.waitForTimeout(900);
    await clicar(page, page.getByRole("button", { name: "Criar rascunho" }));
    await clicar(page, page.getByRole("button", { name: "Finalizar" }).last());
    await clicar(page, page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }));
    await expect(page.getByText("Declaração de acompanhamento ·").first()).toBeVisible();
    await page.waitForTimeout(900);
  });
});

test("fechar o mês do profissional", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(browser, baseURL!, "fechar-mes", "admin", async (page) => {
    await page.goto(`/painel/financeiro/${d.helena}?competencia=${d.competenciaAnterior}`);
    await poster(page, "fechar-mes");
    await clicar(page, page.getByRole("button", { name: /^Fechar / }));
    await clicar(page, page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }));
    await expect(page.getByText(/Fechado em/)).toBeVisible();
  });
});

test("trocar de plano", async ({ browser, baseURL }) => {
  await gravar(browser, baseURL!, "trocar-plano", "admin", async (page) => {
    await page.goto("/painel/assinatura");
    const botao = page.getByRole("button", { name: "Fazer upgrade" }).first();
    await botao.scrollIntoViewIfNeeded();
    await poster(page, "trocar-plano");
    await clicar(page, botao);
    await clicar(page, page.getByRole("dialog", { name: "Confirmar ação" }).getByRole("button", { name: "Confirmar" }));
    await expect(page.getByRole("status").getByText(/os limites já valem/)).toBeVisible();
  });
});

test("paciente agenda pela página pública", async ({ browser, baseURL }) => {
  const d = dados();
  await gravar(
    browser,
    baseURL!,
    "agendar-online",
    null,
    async (page) => {
      await page.goto(`/agendar/${d.slugHelena}`);
      await poster(page, "agendar-online");
      const form = page.locator("form", { has: page.getByRole("button", { name: "Agendar" }) });
      await clicar(page, form.locator("label", { has: page.locator('input[name="inicio"]') }).nth(1));
      await digitar(page, form.getByLabel("Nome completo"), "Marina Lopes");
      await digitar(page, form.getByLabel("Celular (WhatsApp)"), "11988776655");
      await clicar(page, form.getByLabel(/Autorizo o uso do meu nome/));
      await clicar(page, form.getByRole("button", { name: "Agendar" }));
      await expect(page.getByText("Guarde este link para confirmar ou cancelar quando precisar:")).toBeVisible();
    },
    CELULAR,
  );
});
