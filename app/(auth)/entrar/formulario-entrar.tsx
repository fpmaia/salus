"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, useTransition } from "react";
import {
  ArrowRight,
  KeyRound,
  Mail,
  Sparkles,
  Shield,
  UserCheck,
  Stethoscope,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/src/auth/client";
import { loginDemoServerAcao } from "./actions";

// Volta para o convite depois de entrar/cadastrar (só aceita token, nunca URL arbitrária).
function destinoDoConvite(convite: string | string[] | undefined): string | null {
  return typeof convite === "string" && /^[\w-]{20,100}$/.test(convite) ? `/convite/${convite}` : null;
}

export function FormularioEntrar({
  searchParams,
  demo,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Login de demonstração habilitado neste ambiente (ver src/auth/demo.ts). */
  demo: boolean;
}) {
  const parametros = use(searchParams);
  const destino = destinoDoConvite(parametros.convite);
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [demoCarregando, setDemoCarregando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  async function autenticar(emailParaLogar: string, senhaParaLogar: string) {
    setEnviando(true);
    setErro(null);

    const { data, error } = await authClient.signIn.email({
      email: emailParaLogar,
      password: senhaParaLogar,
    });
    // Conta com 2FA: o plugin do cliente leva à tela do código (não abre o painel daqui).
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;

    if (error) {
      setEnviando(false);
      setDemoCarregando(null);
      // Conta sem e-mail confirmado: o Better Auth reenvia o link (sendOnSignIn).
      setErro(
        error.code === "EMAIL_NOT_VERIFIED"
          ? "Confirme seu e-mail para entrar. Enviamos um novo link de confirmação para a sua caixa de entrada."
          : error.status === 429
            ? "Muitas tentativas seguidas. Aguarde alguns segundos e tente de novo."
            : "E-mail ou senha inválidos.",
      );
      return;
    }

    router.push(destino ?? "/painel");
    router.refresh();
  }

  async function entrar(formData: FormData) {
    const emailVal = String(formData.get("email") || email).trim().toLowerCase();
    const senhaVal = String(formData.get("senha") || senha);
    await autenticar(emailVal, senhaVal);
  }

  function entrarDiretoDemo(emailDemo: string, papel: string) {
    if (enviando || demoCarregando || isPending) return;
    setDemoCarregando(papel);
    setErro(null);
    setEmail(emailDemo);

    startTransition(async () => {
      const res = await loginDemoServerAcao(emailDemo);
      if (res?.erro) {
        setDemoCarregando(null);
        setErro(res.erro);
      }
    });
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Acessar o Salus
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          {demo ? "Entre com suas credenciais ou escolha um perfil de demonstração abaixo." : "Entre com seu e-mail e senha."}
        </CardDescription>
      </CardHeader>

      <form action={entrar}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-xs font-medium flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" />
              E-mail
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@espaco.com"
              autoComplete="email"
              className="h-10 text-sm"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="senha" className="text-xs font-medium flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-muted-foreground" />
                Senha
              </Label>
              <Link
                href="/recuperar-senha"
                className="text-xs text-primary hover:underline font-medium"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              className="h-10 text-sm"
              required
            />
          </div>

          {erro && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive animate-in fade-in">
              {erro}
            </div>
          )}

          {/* Atalho de contas demo: só quando habilitado (src/auth/demo.ts). */}
          {demo && (
          <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-muted/20 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5 fill-primary/30" />
                <span>Entrar em 1 toque (Demonstração):</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Toque para acessar</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Botão Admin */}
              <button
                type="button"
                onClick={() => entrarDiretoDemo("admin@alfa.salus.dev", "Admin")}
                disabled={enviando || demoCarregando !== null || isPending}
                className="group flex items-center justify-center sm:justify-start gap-2.5 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 min-h-[46px] text-left transition-all active:scale-95 touch-manipulation hover:border-primary/50 hover:bg-muted/60 disabled:opacity-50"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {demoCarregando === "Admin" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Shield className="size-4" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-heading text-xs font-bold text-foreground leading-tight">
                    {demoCarregando === "Admin" ? "Acessando..." : "Admin"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-none">
                    Gestão total
                  </span>
                </div>
              </button>

              {/* Botão Recepção */}
              <button
                type="button"
                onClick={() => entrarDiretoDemo("recepcao@alfa.salus.dev", "Recepção")}
                disabled={enviando || demoCarregando !== null || isPending}
                className="group flex items-center justify-center sm:justify-start gap-2.5 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 min-h-[46px] text-left transition-all active:scale-95 touch-manipulation hover:border-blue-500/50 hover:bg-muted/60 disabled:opacity-50"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  {demoCarregando === "Recepção" ? (
                    <Loader2 className="size-4 animate-spin text-blue-600" />
                  ) : (
                    <UserCheck className="size-4" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-heading text-xs font-bold text-foreground leading-tight">
                    {demoCarregando === "Recepção" ? "Acessando..." : "Recepção"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-none">
                    Chegada e agenda
                  </span>
                </div>
              </button>

              {/* Botão Profissional */}
              <button
                type="button"
                onClick={() => entrarDiretoDemo("profissional@alfa.salus.dev", "Profissional")}
                disabled={enviando || demoCarregando !== null || isPending}
                className="group flex items-center justify-center sm:justify-start gap-2.5 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 min-h-[46px] text-left transition-all active:scale-95 touch-manipulation hover:border-emerald-500/50 hover:bg-muted/60 disabled:opacity-50"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {demoCarregando === "Profissional" ? (
                    <Loader2 className="size-4 animate-spin text-emerald-600" />
                  ) : (
                    <Stethoscope className="size-4" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-heading text-xs font-bold text-foreground leading-tight">
                    {demoCarregando === "Profissional" ? "Acessando..." : "Profissional"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-none">
                    Link e consultas
                  </span>
                </div>
              </button>
            </div>
          </div>
          )}
        </CardContent>

        <CardFooter className="mt-2 flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-md gap-1.5 min-h-[44px] touch-manipulation text-sm"
            disabled={enviando || demoCarregando !== null || isPending}
          >
            {enviando && !demoCarregando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Entrando…</span>
              </>
            ) : (
              <>
                <span>Entrar com E-mail e Senha</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Não tem uma conta cadastrada?{" "}
            <Link
              href={destino ? `/cadastro?convite=${String(parametros.convite)}` : "/cadastro"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Criar novo espaço
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
