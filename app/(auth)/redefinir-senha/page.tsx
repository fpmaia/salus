"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, Lock } from "lucide-react";
import { authClient } from "@/src/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const router = useRouter();
  const params = use(searchParams);
  const token = params.token;
  const errorParam = params.error;

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(errorParam ? "O link de recuperação é inválido ou expirou." : null);

  async function redefinirSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setErro("Token de recuperação ausente. Solicite um novo link.");
      return;
    }
    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro("A confirmação de senha não confere.");
      return;
    }

    setCarregando(true);
    setErro(null);

    try {
      const res = await authClient.resetPassword({
        newPassword: novaSenha,
        token,
      });

      if (res.error) {
        setErro(res.error.message || "Não foi possível redefinir a senha.");
      } else {
        setSucesso(true);
        setTimeout(() => {
          router.push("/entrar");
        }, 2000);
      }
    } catch {
      setErro("Falha ao comunicar com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-xl backdrop-blur-xl max-w-md w-full">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Definir Nova Senha
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Escolha uma senha forte com no mínimo 8 caracteres.
        </CardDescription>
      </CardHeader>

      {sucesso ? (
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-400 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>Senha alterada com sucesso!</span>
            </div>
            <p className="text-xs">
              Sua nova senha já está ativa. Redirecionando para o login...
            </p>
          </div>
        </CardContent>
      ) : !token ? (
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive">
            Link de recuperação inválido ou expirado. Peça um novo link.
          </div>
          <Button asChild className="w-full">
            <Link href="/recuperar-senha">Solicitar novo link</Link>
          </Button>
        </CardContent>
      ) : (
        <form onSubmit={redefinirSenha}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="novaSenha" className="text-xs font-medium flex items-center gap-1.5">
                <Lock className="size-3.5 text-muted-foreground" />
                Nova Senha
              </Label>
              <Input
                id="novaSenha"
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
                className="h-10 text-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmarSenha" className="text-xs font-medium flex items-center gap-1.5">
                <Lock className="size-3.5 text-muted-foreground" />
                Confirmar Nova Senha
              </Label>
              <Input
                id="confirmarSenha"
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a senha"
                minLength={8}
                required
                className="h-10 text-sm"
              />
            </div>

            {erro && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive">
                {erro}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" disabled={carregando} className="w-full h-10 font-semibold">
              <KeyRound className="size-4 mr-2" />
              {carregando ? "Atualizando..." : "Salvar nova senha"}
            </Button>
            <Link
              href="/entrar"
              className="text-xs text-muted-foreground hover:text-foreground text-center"
            >
              Cancelar e voltar para o login
            </Link>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
