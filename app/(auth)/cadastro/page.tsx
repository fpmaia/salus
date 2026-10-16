"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/src/auth/client";

// Volta para o convite depois de entrar/cadastrar (só aceita token, nunca URL arbitrária).
function destinoDoConvite(convite: string | string[] | undefined): string | null {
  return typeof convite === "string" && /^[\w-]{20,100}$/.test(convite) ? `/convite/${convite}` : null;
}

export default function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = use(searchParams);
  const destino = destinoDoConvite(parametros.convite);
  const valorInicial = (campo: string) => (typeof parametros[campo] === "string" ? parametros[campo] : undefined);
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cadastrar(formData: FormData) {
    setEnviando(true);
    setErro(null);
    const { error } = await authClient.signUp.email({
      name: String(formData.get("nome")),
      email: String(formData.get("email")),
      password: String(formData.get("senha")),
    });
    setEnviando(false);
    if (error) {
      setErro(error.message ?? "Não foi possível criar a conta.");
      return;
    }
    router.push(destino ?? "/onboarding");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>{destino ? "Use o e-mail do convite." : "Depois você cadastra o seu espaço."}</CardDescription>
      </CardHeader>
      <form action={cadastrar}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nome">Seu nome</Label>
            <Input id="nome" name="nome" autoComplete="name" defaultValue={valorInicial("nome")} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" defaultValue={valorInicial("email")} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha">Senha (mín. 8 caracteres)</Label>
            <Input id="senha" name="senha" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Criando…" : "Criar conta"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href={destino ? `/entrar?convite=${String(parametros.convite)}` : "/entrar"} className="text-primary underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
