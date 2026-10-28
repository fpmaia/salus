"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/src/auth/client";
import { destinoDoConvite } from "@/src/auth/destino-convite";
import { VERSAO_DOCUMENTOS, versaoPorExtenso } from "@/src/legal/documentos";
import { Turnstile } from "@/components/turnstile";

export function FormularioCadastro({
  searchParams,
  chaveTurnstile,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Captcha (null = desligado). */
  chaveTurnstile: string | null;
}) {
  const [captcha, setCaptcha] = useState("");
  const parametros = use(searchParams);
  const convite = destinoDoConvite(parametros);
  const destino = convite?.destino ?? null;
  const valorInicial = (campo: string) => (typeof parametros[campo] === "string" ? parametros[campo] : undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);

  async function cadastrar(formData: FormData) {
    setEnviando(true);
    setErro(null);
    const email = String(formData.get("email"));
    const { error } = await authClient.signUp.email({
      name: String(formData.get("nome")),
      email,
      password: String(formData.get("senha")),
      // Depois de confirmar o e-mail, a pessoa entra direto e segue para cá.
      callbackURL: destino ?? "/onboarding",
      fetchOptions: {
        headers: {
          // Versão aceita dos Termos/Política: o servidor confere e registra a prova do aceite.
          ...(formData.get("aceiteDocumentos") === "on" ? { "x-aceite-documentos": VERSAO_DOCUMENTOS } : {}),
          ...(captcha ? { "x-captcha-response": captcha } : {}),
        },
      },
    });
    setEnviando(false);
    if (error) {
      setErro(error.message ?? "Não foi possível criar a conta.");
      return;
    }
    setEmailEnviado(email);
  }

  if (emailEnviado) {
    return (
      <Card className="border-border/70 bg-card/90 shadow-xl backdrop-blur-xl">
        <CardHeader className="space-y-1.5">
          <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">Confirme seu e-mail</CardTitle>
          <CardDescription>
            Enviamos um link de confirmação para <strong>{emailEnviado}</strong>. Abra o e-mail e clique no link para ativar a
            conta; ele vale por 24 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Não chegou? Confira a caixa de spam ou tente entrar: se a conta ainda não estiver confirmada, enviamos um novo link.
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href={destino ? `/entrar?${convite?.consulta}` : "/entrar"}>Ir para o login</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Criar Nova Conta
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          {convite?.consulta.startsWith("trial=")
            ? "Cadastre-se com o e-mail do convite para começar o seu teste grátis."
            : destino
              ? "Cadastre-se para aceitar o convite do seu espaço."
              : "Cadastre-se para começar a gerenciar sua clínica ou espaço."}
        </CardDescription>
      </CardHeader>

      <form action={cadastrar}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nome" className="text-xs font-medium flex items-center gap-1.5">
              <User className="size-3.5 text-muted-foreground" />
              Seu nome completo
            </Label>
            <Input
              id="nome"
              name="nome"
              autoComplete="name"
              defaultValue={valorInicial("nome")}
              placeholder="Dr(a). Nome Sobrenome"
              className="h-9"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-xs font-medium flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" />
              E-mail corporativo ou pessoal
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={valorInicial("email")}
              placeholder="seu.email@exemplo.com"
              className="h-9"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="senha" className="text-xs font-medium flex items-center gap-1.5">
              <Lock className="size-3.5 text-muted-foreground" />
              Senha de acesso
            </Label>
            <Input
              id="senha"
              name="senha"
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              className="h-9"
              required
            />
          </div>

          {erro && (
            <div className="rounded-lg bg-destructive/10 p-2.5 text-xs font-medium text-destructive animate-in fade-in">
              {erro}
            </div>
          )}
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="aceiteDocumentos" required className="mt-0.5" />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="text-primary underline-offset-4 hover:underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="text-primary underline-offset-4 hover:underline">
                Política de Privacidade
              </Link>{" "}
              (versão de {versaoPorExtenso()}).
            </span>
          </label>
          <Turnstile chaveSite={chaveTurnstile} acao="cadastro" aoMudar={setCaptcha} />
        </CardContent>

        <CardFooter className="mt-2 flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-xs gap-1.5"
            disabled={enviando || (Boolean(chaveTurnstile) && !captcha)}
          >
            {enviando ? "Criando conta…" : "Prosseguir com o Cadastro"}
            <ArrowRight className="size-4" />
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Já tem uma conta?{" "}
            <Link
              href={destino ? `/entrar?${convite?.consulta}` : "/entrar"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Fazer login
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
