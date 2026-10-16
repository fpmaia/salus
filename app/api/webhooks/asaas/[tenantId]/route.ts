import { processarWebhookTenant } from "@/src/server/cobrancas";

// Webhook da conta Asaas do espaço (cobranças dos profissionais). Autenticado pelo token
// gerado em Financeiro → Cobrança automática, enviado pelo Asaas no header asaas-access-token.
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/asaas/[tenantId]">) {
  const { tenantId } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return Response.json({ erro: "payload inválido" }, { status: 400 });
  const resultado = await processarWebhookTenant(tenantId, request.headers.get("asaas-access-token"), payload);
  if (resultado === "nao_autorizado") return Response.json({ erro: "não autorizado" }, { status: 401 });
  return Response.json({ resultado });
}
