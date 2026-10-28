import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SENHA = "salus-e2e-123";
export const ARQUIVO_DADOS = "tests/e2e/.dados.json";

export type Papel = "admin" | "recepcao" | "profissional";
export const usuario = (papel: Papel) => `${papel}@e2e.salus.dev`;
/** Conta confirmada, sem espaço, com convite trial da plataforma. */
export const EMAIL_TRIAL = "dona.trial@e2e.salus.dev";

/** Ids criados pelo global-setup. */
export type DadosE2E = { profissionalId: string; reservaAmanha: string; amanha: string; competenciaAnterior: string; sala1: string; atendimentoPago: string; linkPaciente: string; linkConvite: string; linkTeste: string };

export function dados(): DadosE2E {
  return JSON.parse(readFileSync(path.resolve(ARQUIVO_DADOS), "utf-8"));
}

export async function entrar(page: Page, papel: Papel) {
  await page.goto("/entrar");
  // O formulário de login é client-side: espera hidratar antes de enviar.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(usuario(papel));
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);
}

/** TOTP (RFC 6238) como o app autenticador: SHA-1, 30 s, 6 dígitos. */
export function totp(segredoBase32: string, instante = Date.now()): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredoBase32.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(instante / 30_000)));
  const h = createHmac("sha1", chave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

