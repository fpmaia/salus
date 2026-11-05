import { obterContextoTenant } from "@/src/auth/sessao";
import { buscarCep } from "@/src/server/cep";
import { consumirLimite, LIMITES } from "@/src/server/limite-taxa";

// Endereço pelo CEP para os formulários do painel (paciente, unidade). Só para usuários logados.
export async function GET(_request: Request, { params }: RouteContext<"/api/cep/[cep]">) {
  const { cep } = await params;
  const ctx = await obterContextoTenant();
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return Response.json({ erro: "CEP inválido" }, { status: 400 });
  if (!(await consumirLimite(`cep:${ctx.userId}`, LIMITES.cepPorUsuario))) {
    return Response.json({ erro: "Muitas consultas de CEP. Aguarde alguns minutos." }, { status: 429 });
  }
  try {
    const endereco = await buscarCep(digitos);
    if (!endereco) return Response.json({ erro: "CEP não encontrado" }, { status: 404 });
    return Response.json(endereco, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return Response.json({ erro: "Serviço de CEP indisponível" }, { status: 503 });
  }
}
