import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { SalusLogo } from "@/components/brand/salus-logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-8">
        <SalusLogo size="md" />
      </div>

      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
        <FileQuestion className="size-8" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading mb-2">
        Página não encontrada
      </h1>

      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        O endereço que você tentou acessar não existe ou foi removido.
      </p>

      <Button asChild>
        <Link href="/painel">
          <ArrowLeft className="size-4 mr-2" />
          Voltar para o Painel
        </Link>
      </Button>
    </div>
  );
}
