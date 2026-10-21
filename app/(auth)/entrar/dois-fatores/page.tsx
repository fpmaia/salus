"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/src/auth/client";

// Segundo passo do login para contas com 2FA: código do app autenticador ou de recuperação.
export default function DoisFatoresLoginPage() {
  const router = useRouter();
  const [recuperacao, setRecuperacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function verificar(formData: FormData) {
    setEnviando(true);
    setErro(null);
    const code = String(formData.get("codigo") ?? "").replace(/\s/g, "");
    const trustDevice = formData.get("confiar") === "on";
    const { error } = recuperacao
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setEnviando(false);
    if (error) {
      setErro(error.status === 429 ? "Muitas tentativas. Aguarde um minuto." : "Código inválido ou expirado.");
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>
          {recuperacao ? "Digite um dos seus códigos de recuperação (cada um vale uma vez)." : "Digite o código de 6 dígitos do seu app autenticador."}
        </CardDescription>
      </CardHeader>
      <form action={verificar}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="codigo">{recuperacao ? "Código de recuperação" : "Código"}</Label>
            <Input
              id="codigo"
              name="codigo"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={recuperacao ? "text" : "numeric"}
              pattern={recuperacao ? undefined : "[0-9 ]{6,7}"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confiar" /> Confiar neste dispositivo por 30 dias
          </label>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Verificando…" : "Entrar"}
          </Button>
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setRecuperacao(!recuperacao)}>
            {recuperacao ? "Usar o código do app autenticador" : "Perdi o acesso ao app: usar um código de recuperação"}
          </button>
          <Link href="/entrar" className="text-xs text-muted-foreground hover:underline">
            Voltar ao login
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
