import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { obterSessao } from "@/src/auth/sessao";
import { versaoPorExtenso } from "@/src/legal/documentos";
import { aceitarDocumentosAcao } from "./actions";

// Portão de aceite: aparece quando a versão dos documentos muda (ou nunca foi aceita).
export default async function AceiteTermosPage({ searchParams }: PageProps<"/aceite-termos">) {
  if (!(await obterSessao())) redirect("/entrar");
  const { erro } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atualizamos nossos documentos</CardTitle>
        <CardDescription>
          Para continuar usando o Salus, leia e aceite a versão de {versaoPorExtenso()} dos Termos de Uso e da Política de Privacidade.
        </CardDescription>
      </CardHeader>
      <form action={aceitarDocumentosAcao}>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            <Link href="/termos" target="_blank" className="text-primary underline-offset-4 hover:underline">
              Termos de Uso
            </Link>{" "}
            ·{" "}
            <Link href="/privacidade" target="_blank" className="text-primary underline-offset-4 hover:underline">
              Política de Privacidade
            </Link>
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="aceite" required className="mt-1" />
            <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
          </label>
          {erro && <p className="text-destructive">Marque o aceite para continuar.</p>}
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" className="w-full">
            Continuar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
