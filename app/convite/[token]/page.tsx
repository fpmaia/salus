import Link from "next/link";
import { CabecalhoEspaco } from "@/components/cabecalho-espaco";
import { FormAcao } from "@/components/form-acao";
import { RodapeLegal } from "@/components/rodape-legal";
import { primeiroNome } from "@/src/domain/notificacoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoSair } from "@/app/painel/botao-sair";
import { obterSessao } from "@/src/auth/sessao";
import { obterConvite, type SituacaoConvite } from "@/src/server/profissionais";
import { aceitarConviteAcao } from "./actions";

const MENSAGEM_SITUACAO: Record<Exclude<SituacaoConvite, "valido">, string> = {
  aceito: "Este convite já foi aceito. Entre com a sua conta para acessar o painel.",
  expirado: "Este convite expirou. Peça um novo link ao espaço.",
  revogado: "Este convite foi substituído por um link mais recente.",
};

export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const [convite, sessao] = await Promise.all([obterConvite(token), obterSessao()]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      {convite && <CabecalhoEspaco nome={convite.tenantNome} />}
      <Card className="w-full max-w-md">
        {!convite ? (
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>Confira se o link foi copiado por inteiro.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Olá, {primeiroNome(convite.profissionalNome)}!</CardTitle>
              <CardDescription>
                {convite.tenantNome} convidou você para usar o Salus: com ele você vê a sua agenda, reserva salas, acompanha o seu contrato e
                paga pelo PIX.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {convite.situacao !== "valido" ? (
                <p>{MENSAGEM_SITUACAO[convite.situacao]}</p>
              ) : !sessao ? (
                <p>
                  Crie sua conta ou entre usando o e-mail <strong>{convite.email}</strong>.
                </p>
              ) : sessao.user.email.toLowerCase() !== convite.email.toLowerCase() ? (
                <p>
                  Você está conectado como <strong>{sessao.user.email}</strong>, mas o convite é para{" "}
                  <strong>{convite.email}</strong>. Saia e entre com o e-mail do convite.
                </p>
              ) : (
                <FormAcao acao={aceitarConviteAcao.bind(null, token)} textoBotao="Aceitar convite" textoPendente="Aceitando…" />
              )}
            </CardContent>
            {convite.situacao === "valido" && (
              <CardFooter className="mt-2 flex flex-wrap gap-3">
                {!sessao ? (
                  <>
                    <Button asChild>
                      <Link
                        href={`/cadastro?convite=${encodeURIComponent(token)}&email=${encodeURIComponent(convite.email)}&nome=${encodeURIComponent(convite.profissionalNome)}`}
                      >
                        Criar conta
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/entrar?convite=${encodeURIComponent(token)}`}>Já tenho conta</Link>
                    </Button>
                  </>
                ) : (
                  sessao.user.email.toLowerCase() !== convite.email.toLowerCase() && <BotaoSair destino={`/entrar?convite=${encodeURIComponent(token)}`} />
                )}
              </CardFooter>
            )}
            {convite.situacao === "aceito" && (
              <CardFooter className="mt-2">
                <Button asChild>
                  <Link href="/painel">Ir para o painel</Link>
                </Button>
              </CardFooter>
            )}
          </>
        )}
      </Card>
      <RodapeLegal />
    </main>
  );
}
