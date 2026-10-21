import { gerarIcs } from "@/src/domain/calendario";
import { obterAgendamentoPublico } from "@/src/server/notificacoes";

// "Adicionar à agenda": a consulta do link do paciente como evento de calendário (.ics).
export async function GET(_request: Request, { params }: RouteContext<"/c/[token]/calendario">) {
  const { token } = await params;
  const a = await obterAgendamentoPublico(token);
  if (!a) return new Response("Link inválido ou expirado", { status: 404 });
  const ics = gerarIcs({
    uid: a.uid,
    inicio: a.inicio,
    fim: a.fim,
    titulo: `Consulta com ${a.profissionalNome}`,
    local: a.local,
    descricao: a.espaco ? `${a.espaco}. Para confirmar ou cancelar, use o link que você recebeu.` : null,
    geradoEm: new Date(),
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="consulta.ics"',
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}
