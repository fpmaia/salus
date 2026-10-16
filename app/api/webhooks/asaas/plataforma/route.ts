import { processarWebhookPlataforma } from "@/src/server/assinatura";

// Webhook da conta Asaas da plataforma (faturas do SaaS). Autenticado pelo header
// asaas-access-token (= ASAAS_WEBHOOK_TOKEN). Responde 200 também para eventos ignorados
// ou repetidos, para o Asaas não pausar a fila.
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return Response.json({ erro: "payload inválido" }, { status: 400 });
  const resultado = await processarWebhookPlataforma(request.headers.get("asaas-access-token"), payload);
  if (resultado === "nao_autorizado") return Response.json({ erro: "não autorizado" }, { status: 401 });
  return Response.json({ resultado });
}
