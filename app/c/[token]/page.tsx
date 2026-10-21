import type { Metadata } from "next";
import { CalendarPlus, MapPin } from "lucide-react";
import { CabecalhoEspaco } from "@/components/cabecalho-espaco";
import { FormAcao } from "@/components/form-acao";
import { RodapeLegal } from "@/components/rodape-legal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { linkDoMapa } from "@/src/domain/calendario";
import { obterAgendamentoPublico } from "@/src/server/notificacoes";
import { acaoDoPacienteAcao } from "./actions";

// O link carrega o token na URL: não deixe buscadores indexarem nem vazarem via Referer.
export const metadata: Metadata = { title: "Sua consulta", robots: { index: false, follow: false }, referrer: "no-referrer" };

const SITUACAO: Record<string, string> = {
  agendado: "Agendada: confirme sua presença, por favor.",
  confirmado: "Confirmada. Até lá!",
  presente: "Você já está na recepção.",
  realizado: "Consulta realizada.",
  falta: "Consulta registrada como falta.",
  cancelado: "Consulta cancelada.",
};

export default async function LinkDoPacientePage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const agendamento = await obterAgendamentoPublico(token);
  const ativa = agendamento && (agendamento.status === "agendado" || agendamento.status === "confirmado");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      {agendamento && <CabecalhoEspaco nome={agendamento.espaco} />}
      <Card className="w-full max-w-md">
        {!agendamento ? (
          <CardHeader>
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>Fale com a recepção do espaço: ela confirma ou remarca para você.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Olá, {agendamento.pacienteNome}!</CardTitle>
              <CardDescription className="text-base text-foreground">
                Sua consulta com <strong>{agendamento.profissionalNome}</strong> é em <strong>{agendamento.data}</strong>, às{" "}
                <strong>{agendamento.hora}</strong>.
              </CardDescription>
              <p className="text-sm text-muted-foreground">{agendamento.local}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="rounded-lg bg-muted px-3 py-2">{SITUACAO[agendamento.status]}</p>
              {ativa && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={`/c/${token}/calendario`}>
                      <CalendarPlus className="size-4" /> Adicionar à agenda
                    </a>
                  </Button>
                  {agendamento.endereco && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={linkDoMapa(agendamento.endereco)} target="_blank" rel="noreferrer">
                        <MapPin className="size-4" /> Ver no mapa
                      </a>
                    </Button>
                  )}
                </div>
              )}
              {ativa && (
                <div className="flex flex-wrap gap-3 border-t pt-4">
                  {agendamento.status === "agendado" && (
                    <FormAcao acao={acaoDoPacienteAcao.bind(null, token, "confirmar")} textoBotao="Confirmar presença" textoPendente="Confirmando…" />
                  )}
                  <FormAcao
                    acao={acaoDoPacienteAcao.bind(null, token, "cancelar")}
                    textoBotao="Não vou poder ir"
                    textoPendente="Cancelando…"
                    variante="outline"
                    confirmar="Cancelar a consulta? Se for em cima da hora, o espaço pode cobrar. Se quiser outro horário, fale com a recepção."
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
