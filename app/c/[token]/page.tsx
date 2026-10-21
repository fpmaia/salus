import type { Metadata } from "next";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROTULOS_STATUS } from "@/src/domain/agendamentos";
import { obterAgendamentoPublico } from "@/src/server/notificacoes";
import { acaoDoPacienteAcao } from "./actions";
import { RodapeLegal } from "@/components/rodape-legal";

// O link carrega o token na URL: não deixe buscadores indexarem nem vazarem via Referer.
export const metadata: Metadata = { title: "Seu atendimento · Salus", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LinkDoPacientePage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const agendamento = await obterAgendamentoPublico(token);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      <Card className="w-full max-w-md">
        {!agendamento ? (
          <CardHeader>
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>Entre em contato com a recepção do espaço.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Olá, {agendamento.pacienteNome}</CardTitle>
              <CardDescription>
                Atendimento com {agendamento.profissionalNome} em <strong>{agendamento.data}</strong> às{" "}
                <strong>{agendamento.hora}</strong>.
                <span className="block">{agendamento.local}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p>
                Situação: <strong>{ROTULOS_STATUS[agendamento.status]}</strong>
              </p>
              {(agendamento.status === "agendado" || agendamento.status === "confirmado") && (
                <div className="flex flex-wrap gap-3">
                  {agendamento.status === "agendado" && (
                    <FormAcao acao={acaoDoPacienteAcao.bind(null, token, "confirmar")} textoBotao="Confirmar presença" textoPendente="Confirmando…" />
                  )}
                  <FormAcao
                    acao={acaoDoPacienteAcao.bind(null, token, "cancelar")}
                    textoBotao="Cancelar atendimento"
                    textoPendente="Cancelando…"
                    variante="destructive"
                    confirmar="Tem certeza que deseja cancelar? Cancelamentos com pouca antecedência podem ser cobrados."
                  />
                </div>
              )}
              {agendamento.recebeLembretes && (
                <div className="border-t pt-3">
                  <FormAcao
                    acao={acaoDoPacienteAcao.bind(null, token, "parar_lembretes")}
                    textoBotao="Não quero receber lembretes por WhatsApp"
                    textoPendente="Salvando…"
                    variante="outline"
                  />
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
      <RodapeLegal />
    </main>
  );
}
