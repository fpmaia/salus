// Logs estruturados: em produção, uma linha JSON por evento (fácil de filtrar no `docker compose
// logs` ou num coletor); em dev, texto legível. Nunca registre dado pessoal ou de saúde aqui:
// use ids (tenantId, pacienteId), nunca nome, telefone, e-mail ou conteúdo.

export type Nivel = "debug" | "info" | "warn" | "error";
const PESO: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let servico = process.env.SALUS_SERVICO || "app";

/** O processo se identifica uma vez (app ou worker). */
export function definirServico(nome: string) {
  servico = nome;
}

export function serializarErro(erro: unknown): Record<string, unknown> {
  if (erro instanceof Error) {
    const causa = (erro as { cause?: unknown }).cause;
    return {
      nome: erro.name,
      mensagem: erro.message,
      pilha: erro.stack?.split("\n").slice(0, 12).join("\n"),
      ...(causa ? { causa: serializarErro(causa) } : {}),
    };
  }
  return { valor: String(erro) };
}

function nivelMinimo(): Nivel {
  const configurado = process.env.LOG_NIVEL as Nivel | undefined;
  return configurado && configurado in PESO ? configurado : "info";
}

export function registrar(nivel: Nivel, mensagem: string, campos: Record<string, unknown> = {}) {
  if (PESO[nivel] < PESO[nivelMinimo()]) return;
  const dados = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v instanceof Error ? serializarErro(v) : v]));
  const saida = nivel === "error" || nivel === "warn" ? process.stderr : process.stdout;
  if (process.env.NODE_ENV === "production") {
    saida.write(
      `${JSON.stringify({ ts: new Date().toISOString(), nivel, servico, versao: process.env.SALUS_VERSAO, msg: mensagem, ...dados })}\n`,
    );
  } else {
    const extra = Object.keys(dados).length ? ` ${JSON.stringify(dados)}` : "";
    saida.write(`[${servico}] ${nivel.toUpperCase()} ${mensagem}${extra}\n`);
  }
}

export const log = {
  debug: (mensagem: string, campos?: Record<string, unknown>) => registrar("debug", mensagem, campos),
  info: (mensagem: string, campos?: Record<string, unknown>) => registrar("info", mensagem, campos),
  warn: (mensagem: string, campos?: Record<string, unknown>) => registrar("warn", mensagem, campos),
  error: (mensagem: string, campos?: Record<string, unknown>) => registrar("error", mensagem, campos),
};

/** Para logs: "ana@exemplo.com" → "a***@exemplo.com". */
export function mascararEmail(email: string): string {
  const [nome, dominio] = email.split("@");
  return dominio ? `${nome.slice(0, 1)}***@${dominio}` : "***";
}
