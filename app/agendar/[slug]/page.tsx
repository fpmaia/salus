import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { diaSemana } from "@/src/domain/tempo";
import { obterPaginaPublica } from "@/src/server/agendamento-online";
import { agendarOnlineAcao } from "./actions";
import { FormularioAgendamento } from "./formulario";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export async function generateMetadata({ params }: PageProps<"/agendar/[slug]">): Promise<Metadata> {
  const pagina = await obterPaginaPublica((await params).slug);
  return { title: pagina ? `Agendar com ${pagina.profissional.nome}` : "Agenda indisponível" };
}

export default async function AgendarPage({ params }: PageProps<"/agendar/[slug]">) {
  const { slug } = await params;
  const pagina = await obterPaginaPublica(slug);

  return (
    <main className="flex flex-1 justify-center bg-muted/40 px-4 py-10">
      <Card className="h-fit w-full max-w-xl">
        {!pagina ? (
          <CardHeader>
            <CardTitle>Agenda indisponível</CardTitle>
            <CardDescription>Este link não está ativo. Fale diretamente com o profissional ou com o espaço.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{pagina.profissional.nome}</CardTitle>
              <CardDescription>
                {[pagina.profissional.especialidade, pagina.profissional.registro].filter(Boolean).join(" · ")}
                <span className="block">
                  {pagina.espaco}
                  {pagina.locais.length > 0 && ` · ${pagina.locais.map((l) => (l.endereco ? `${l.nome} — ${l.endereco}` : l.nome)).join(" / ")}`}
                </span>
                {pagina.profissional.mensagem && <span className="mt-2 block text-foreground">{pagina.profissional.mensagem}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pagina.dias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Não há horários disponíveis no momento. Tente novamente mais tarde.</p>
              ) : (
                <FormularioAgendamento
                  acao={agendarOnlineAcao.bind(null, slug)}
                  dias={pagina.dias.map((d) => ({
                    data: d.data,
                    rotulo: `${DIAS[diaSemana(d.data)]} ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`,
                    horarios: d.horarios,
                  }))}
                />
              )}
              <p className="mt-4 text-xs text-muted-foreground">Consultas de {pagina.profissional.duracaoMin} minutos.</p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
