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

  // E-mail: sem ele ninguém confirma a conta nem redefine a senha. "console" só em ambiente de demonstração.
  const provedorEmail = variavel("EMAIL_PROVIDER") ?? "console";
  if (provedorEmail === "resend") {
    for (const nome of ["RESEND_API_KEY", "EMAIL_FROM"]) if (!variavel(nome)) erros.push(`${nome} não definida (EMAIL_PROVIDER=resend)`);
  } else if (provedorEmail !== "console") {
    erros.push(`EMAIL_PROVIDER inválido: ${provedorEmail} (use resend ou console)`);
  } else if (emProducao() && !["true", "1"].includes(process.env.SALUS_DEMO ?? "")) {
    erros.push("EMAIL_PROVIDER=console não envia e-mails: use resend (ou SALUS_DEMO=true num ambiente de demonstração)");
  }

  // WhatsApp: console (log), meta (Cloud API oficial) ou evolution (QR Code por espaço).
  const whatsapp = variavel("WHATSAPP_PROVIDER") ?? "console";
  if (!["console", "meta", "evolution"].includes(whatsapp)) erros.push(`WHATSAPP_PROVIDER inválido: ${whatsapp} (use console, meta ou evolution)`);
  if (whatsapp === "meta") {
    for (const nome of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) if (!variavel(nome)) erros.push(`${nome} não definida (WHATSAPP_PROVIDER=meta)`);
  }
  if (whatsapp === "evolution") {
    for (const nome of ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"]) if (!variavel(nome)) erros.push(`${nome} não definida (WHATSAPP_PROVIDER=evolution)`);
  }

  // Captcha nas páginas públicas (cadastro, senha, agendamento online).
  const demo = ["true", "1"].includes(process.env.SALUS_DEMO ?? "");
  // Sem Sentry, erro de produção fica só no log, sem alerta para ninguém.
  if (emProducao() && !demo && !variavel("SENTRY_DSN")) erros.push("SENTRY_DSN não definida (monitoramento de erros e alertas)");
  if (processo === "app" && emProducao() && !demo) {
    for (const nome of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) if (!variavel(nome)) erros.push(`${nome} não definida (captcha das páginas públicas)`);
    // Identificação na Política de Privacidade e nos Termos (LGPD art. 9º e 41).
    for (const nome of ["SALUS_EMPRESA_NOME", "SALUS_EMPRESA_CNPJ", "SALUS_ENCARREGADO_EMAIL"]) {
      if (!variavel(nome)) erros.push(`${nome} não definida (documentos legais)`);
    }
  }
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
