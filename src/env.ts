// Validação do ambiente no boot (app via instrumentation.ts, worker no início do processo).
// Em produção, todo segredo é obrigatório e independente: sem fallback para o BETTER_AUTH_SECRET,
// porque trocar o segredo de sessão tornaria ilegível o que foi cifrado (prontuário, tokens).

export const emProducao = () => process.env.NODE_ENV === "production";

/** Valor da variável, tratando string vazia (compose com `${X:-}`) como ausente. */
export function variavel(nome: string): string | undefined {
  const valor = process.env[nome];
  return valor ? valor : undefined;
}

export function errosDoAmbiente(processo: "app" | "worker"): string[] {
  const erros: string[] = [];
  const obrigatorias = ["DATABASE_URL", "BETTER_AUTH_SECRET", "SECRETS_KEY", "LINKS_SECRET", "APP_URL"];
  if (processo === "app") obrigatorias.push("BETTER_AUTH_URL");
  for (const nome of obrigatorias) if (!variavel(nome)) erros.push(`${nome} não definida`);

  const secretsKey = variavel("SECRETS_KEY");
  if (secretsKey && Buffer.from(secretsKey, "base64").length !== 32) erros.push("SECRETS_KEY deve ter 32 bytes em base64 (openssl rand -base64 32)");
  const links = variavel("LINKS_SECRET");
  if (links && links.length < 32) erros.push("LINKS_SECRET deve ter ao menos 32 caracteres");
  const auth = variavel("BETTER_AUTH_SECRET");
  if (auth && auth.length < 32) erros.push("BETTER_AUTH_SECRET deve ter ao menos 32 caracteres");
  if (auth && (auth === links || auth === secretsKey)) erros.push("BETTER_AUTH_SECRET, LINKS_SECRET e SECRETS_KEY devem ser diferentes");
  return erros;
}

/** Em produção, recusa subir com ambiente incompleto; em dev, só avisa. */
export function validarAmbiente(processo: "app" | "worker") {
  const erros = errosDoAmbiente(processo);
  if (erros.length === 0) return;
  const mensagem = `Ambiente inválido (${processo}):\n- ${erros.join("\n- ")}`;
  if (emProducao()) throw new Error(mensagem);
  console.warn(`${mensagem}\n(em dev os segredos caem no BETTER_AUTH_SECRET; em produção isso impede o boot)`);
}
