import { exigirUsuario } from "@/src/auth/sessao";
import { gerarCsv } from "@/src/domain/csv";
import { listarAuditoriaPlataforma } from "@/src/server/plataforma";
import { filtrosDaAuditoria } from "../filtros";

// Exportação da auditoria da plataforma com os mesmos filtros da tela (até 5000 eventos).
export async function GET(request: Request) {
  const usuario = await exigirUsuario();
  const filtros = filtrosDaAuditoria(Object.fromEntries(new URL(request.url).searchParams));
  const eventos = await listarAuditoriaPlataforma(usuario.id, 5000, undefined, filtros);
  const csv = gerarCsv([
    ["quando", "acao", "alvo_tipo", "alvo_id", "pessoa", "email", "dados"],
    ...eventos.map((e) => [e.criadoEm.toISOString(), e.acao, e.alvoTipo, e.alvoId, e.userNome, e.userEmail, e.dados ? JSON.stringify(e.dados) : null]),
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-plataforma-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
