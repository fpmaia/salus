import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Transaction } from "../db/client";
import { chavesTenant } from "../db/schema";
import { cifrar, decifrar } from "./cripto";

// Cifragem de dados clínicos com uma chave de dados por tenant (AES-256-GCM). A chave
// fica no banco cifrada pela SECRETS_KEY (envelope): um dump do banco sozinho não abre nada.

/** Chave de dados do tenant do contexto (criada na primeira vez). */
export async function chaveDoTenant(tx: Transaction): Promise<Buffer> {
  const [existente] = await tx.select().from(chavesTenant);
  if (existente) return Buffer.from(decifrar(existente.chaveCifrada), "base64");
  const nova = randomBytes(32);
  const inseridas = await tx
    .insert(chavesTenant)
    .values({ chaveCifrada: cifrar(nova.toString("base64")) })
    .onConflictDoNothing()
    .returning();
  if (inseridas.length > 0) return nova;
  // Outra transação criou ao mesmo tempo: usa a dela.
  const [criada] = await tx.select().from(chavesTenant);
  return Buffer.from(decifrar(criada.chaveCifrada), "base64");
}

/** Formato binário: iv(12) | tag(16) | cifrado. */
export function cifrarBytes(chave: Buffer, dados: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const cifrado = Buffer.concat([cipher.update(dados), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]);
}

export function decifrarBytes(chave: Buffer, pacote: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", chave, pacote.subarray(0, 12));
  decipher.setAuthTag(pacote.subarray(12, 28));
  return Buffer.concat([decipher.update(pacote.subarray(28)), decipher.final()]);
}

export function cifrarTexto(chave: Buffer, texto: string): string {
  return cifrarBytes(chave, Buffer.from(texto, "utf8")).toString("base64");
}

export function decifrarTexto(chave: Buffer, valor: string): string {
  return decifrarBytes(chave, Buffer.from(valor, "base64")).toString("utf8");
}

export function sha256(dados: string | Buffer): string {
  return createHash("sha256").update(dados).digest("hex");
}
