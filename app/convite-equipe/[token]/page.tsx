import Link from "next/link";
import { CabecalhoEspaco } from "@/components/cabecalho-espaco";
import { FormAcao } from "@/components/form-acao";
import { RodapeLegal } from "@/components/rodape-legal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoSair } from "@/app/painel/botao-sair";
import { obterSessao } from "@/src/auth/sessao";
import { ROTULOS_ROLE } from "@/src/domain/rbac";
import { obterConviteMembroPublico } from "@/src/server/equipe";
import { aceitarConviteEquipeAcao } from "./actions";

export default async function ConviteEquipePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [convite, sessao] = await Promise.all([
    obterConviteMembroPublico(token),
    obterSessao(),
  ]);

  return (
    <main className="flex min-h-[80vh] flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      {convite && <CabecalhoEspaco nome={convite.tenantNome} />}
      <Card className="w-full max-w-md shadow-lg border-border/80">
        {!convite ? (
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>
              Este link de convite não existe ou foi informado incorretamente.
            </CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Você foi convidado para a equipe</CardTitle>
              <CardDescription>
                {convite.tenantNome} convidou você para trabalhar como{" "}
                <strong className="text-foreground">{ROTULOS_ROLE[convite.role]}</strong> no Salus, o sistema de agenda e salas do espaço.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {!convite.valido ? (
                <div className="rounded-lg bg-destructive/10 p-3 text-destructive">
                  {convite.aceitoEm
                    ? "Este convite já foi aceito. Entre com a sua conta para acessar o painel."
                    : convite.revogadoEm
                    ? "Este convite foi revogado ou substituído pelo administrador."
                    : "Este convite expirou. Solicite um novo link ao administrador do espaço."}
                </div>
              ) : !sessao ? (
                <p>
                  Para aceitar o convite, entre ou crie sua conta com o e-mail{" "}
                  <strong className="text-foreground">{convite.email}</strong>.
                </p>
              ) : sessao.user.email.toLowerCase() !== convite.email.toLowerCase() ? (
                <p className="text-destructive">
                  Você está conectado como <strong>{sessao.user.email}</strong>, mas este convite foi enviado para{" "}
                  <strong>{convite.email}</strong>. Saia da conta atual para continuar.
                </p>
              ) : (
                <FormAcao
                  acao={aceitarConviteEquipeAcao.bind(null, token)}
                  textoBotao="Aceitar convite e entrar no espaço"
                  textoPendente="Confirmando participação..."
                />
              )}
            </CardContent>
            {convite.valido && (
              <CardFooter className="mt-2 flex flex-wrap gap-3">
                {!sessao ? (
                  <>
                    <Button asChild>
                      <Link
                        href={`/cadastro?equipe=${encodeURIComponent(token)}&email=${encodeURIComponent(convite.email)}`}
                      >
                        Criar conta
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link
                        href={`/entrar?equipe=${encodeURIComponent(token)}&email=${encodeURIComponent(convite.email)}`}
                      >
                        Já tenho conta
                      </Link>
                    </Button>
                  </>
                ) : sessao.user.email.toLowerCase() !== convite.email.toLowerCase() ? (
                  <BotaoSair />
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
