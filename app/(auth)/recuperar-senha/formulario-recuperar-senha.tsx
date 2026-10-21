"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";
import { authClient } from "@/src/auth/client";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioRecuperarSenha({ chaveTurnstile }: { chaveTurnstile: string | null }) {
  const [captcha, setCaptcha] = useState("");
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function solicitarRecuperacao(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    try {
      const res = await authClient.requestPasswordReset(
        { email, redirectTo: `${window.location.origin}/redefinir-senha` },
        captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
      );

      if (res.error) {
        setErro(res.error.message || "Não foi possível processar a recuperação de senha.");
      } else {
        setSucesso(true);
      }
    } catch {
      setErro("Ocorreu uma falha ao enviar o link. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-xl backdrop-blur-xl max-w-md w-full">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Recuperar Senha
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Digite seu e-mail cadastrado para receber instruções de redefinição de acesso.
        </CardDescription>
      </CardHeader>

      {sucesso ? (
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-success/20 bg-success/10 p-4 text-success text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>Verifique seu e-mail</span>
            </div>
            <p className="text-xs">
              Se houver uma conta associada a <strong>{email}</strong>, enviamos um link para redefinir sua senha.
            </p>
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-success/20">
              O link vale por 1 hora. Não chegou? Confira a caixa de spam.
            </p>
          </div>
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full">
              <Link href="/entrar">Voltar para o login</Link>
            </Button>
          </div>
        </CardContent>
      ) : (
        <form onSubmit={solicitarRecuperacao}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-xs font-medium flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                E-mail cadastrado
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@espaco.com"
                required
                className="h-10 text-sm"
              />
            </div>

            {erro && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive">
                {erro}
              </div>
            )}
            <Turnstile chaveSite={chaveTurnstile} acao="recuperar-senha" aoMudar={setCaptcha} />
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" disabled={carregando || (Boolean(chaveTurnstile) && !captcha)} className="w-full h-10 font-semibold">
              <KeyRound className="size-4 mr-2" />
              {carregando ? "Enviando link..." : "Enviar link de recuperação"}
            </Button>
            <Link
              href="/entrar"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3" /> Voltar para o login
            </Link>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
