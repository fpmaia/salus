import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Segredos de integrações guardados no banco (ex.: token da Focus NFe), cifrados com
// AES-256-GCM. Chave: SECRETS_KEY (32 bytes em base64) ou, em dev, derivada do BETTER_AUTH_SECRET.

function chave(): Buffer {
  const explicita = process.env.SECRETS_KEY;
  if (explicita) {
    const bytes = Buffer.from(explicita, "base64");
    if (bytes.length !== 32) throw new Error("SECRETS_KEY deve ter 32 bytes em base64 (openssl rand -base64 32)");
    return bytes;
  }
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) throw new Error("Defina SECRETS_KEY (ou BETTER_AUTH_SECRET) para cifrar segredos");
  return createHash("sha256").update(`salus:segredos:${base}`).digest();
}

/** Formato: v1.<iv>.<tag>.<cifrado> (base64url). */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function decifrar(valor: string): string {
  const [versao, iv, tag, cifrado] = valor.split(".");
  if (versao !== "v1" || !iv || !tag || !cifrado) throw new Error("Segredo cifrado em formato inválido");
  const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cifrado, "base64url")), decipher.final()]).toString("utf8");
}
