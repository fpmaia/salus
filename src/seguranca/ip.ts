// IP do cliente para rate limit. Só vale um cabeçalho que o reverse proxy (Caddy) sobrescreve:
// IP_HEADER (padrão x-real-ip). Valor com vários IPs (x-forwarded-for encadeado) é ignorado,
// porque o cliente consegue forjar o começo da lista. A mesma regra vale no Better Auth.

export function cabecalhosDeIp(): string[] {
  const configurado = (process.env.IP_HEADER || "x-real-ip").toLowerCase();
  return configurado === "x-forwarded-for" ? [configurado] : [configurado, "x-forwarded-for"];
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function ipDoCliente(headers: Headers): string | null {
  for (const nome of cabecalhosDeIp()) {
    const valor = headers.get(nome)?.trim();
    if (!valor || valor.includes(",")) continue;
    if (IPV4.test(valor) || (valor.includes(":") && IPV6.test(valor))) return valor;
  }
  return process.env.NODE_ENV === "production" ? null : "127.0.0.1";
}
