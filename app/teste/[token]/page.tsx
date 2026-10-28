import Link from "next/link";
import { Gift } from "lucide-react";
import { RodapeLegal } from "@/components/rodape-legal";
import { SalusLogo } from "@/components/brand/salus-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoSair } from "@/app/painel/botao-sair";
import { obterSessao } from "@/src/auth/sessao";
import { obterConviteClinicaPublico } from "@/src/server/convites-clinica";
import { listarMembershipsDoUsuario } from "@/src/server/memberships";

// Link do convite trial: explica o teste e leva a pessoa a criar a conta (ou entrar) com o
// e-mail convidado e cadastrar o espaço com o convite.
export default async function ConviteTestePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [convite, sessao] = await Promise.all([obterConviteClinicaPublico(token), obterSessao()]);
  const emailConfere = sessao && convite && sessao.user.email.toLowerCase() === convite.email.toLowerCase();
  const jaTemEspaco = emailConfere ? (await listarMembershipsDoUsuario(sessao.user.id)).length > 0 : false;
  const consulta = `trial=${encodeURIComponent(token)}`;

  return (
    <main className="flex min-h-[80vh] flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      <SalusLogo href="/" size="lg" priority />
      <Card className="w-full max-w-md border-border/80 shadow-lg">
        {!convite ? (
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>Este link de teste grátis não existe ou foi copiado incompleto.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Gift className="size-5" />
              </div>
              <CardTitle>
                {convite.diasTeste} dias grátis no plano {convite.planoNome}
              </CardTitle>
              <CardDescription>
                A equipe Salus liberou um teste grátis para você cadastrar a sua clínica ou espaço, com todos os módulos. Durante o teste
                não há cobrança.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {convite.situacao !== "pendente" ? (
                <div className="rounded-lg bg-destructive/10 p-3 text-destructive">
                  {convite.situacao === "usado"
                    ? "Este convite já foi usado. Entre com a sua conta para acessar o painel."
                    : convite.situacao === "revogado"
                      ? "Este convite foi cancelado ou substituído pela equipe Salus."
                      : "Este convite expirou. Peça um novo à equipe Salus."}
                </div>
              ) : !sessao ? (
                <p>
                  Crie a sua conta (ou entre) com o e-mail <strong className="text-foreground">{convite.email}</strong>. Depois, é só
                  informar o nome e o CPF ou CNPJ do espaço.
                </p>
              ) : !emailConfere ? (
                <p className="text-destructive">
                  Você está conectado como <strong>{sessao.user.email}</strong>, mas este convite é para <strong>{convite.email}</strong>.
                  Saia da conta atual para continuar.
                </p>
              ) : jaTemEspaco ? (
                <p className="text-destructive">
                  Sua conta já participa de um espaço no Salus. O convite de teste serve para cadastrar um espaço novo: fale com a
                  equipe Salus.
                </p>
              ) : (
                <p>Tudo certo. Cadastre o seu espaço para começar o teste.</p>
              )}
            </CardContent>
            {convite.situacao === "pendente" && (
              <CardFooter className="flex flex-wrap gap-3">
                {!sessao ? (
                  <>
                    <Button asChild>
                      <Link href={`/cadastro?${consulta}&email=${encodeURIComponent(convite.email)}`}>Criar conta</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/entrar?${consulta}`}>Já tenho conta</Link>
                    </Button>
                  </>
                ) : !emailConfere ? (
                  <BotaoSair destino={`/entrar?${consulta}`} />
                ) : !jaTemEspaco ? (
                  <Button asChild>
                    <Link href={`/onboarding?${consulta}`}>Cadastrar meu espaço</Link>
                  </Button>
                ) : null}
              </CardFooter>
            )}
          </>
        )}
      </Card>
      <RodapeLegal />
    </main>
  );
}
