import Link from "next/link";
import { ArrowLeft, ShieldAlert, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AcessoNegadoProps {
  titulo?: string;
  mensagem?: string;
  voltarHref?: string;
}

export function AcessoNegado({
  titulo = "Acesso Restrito",
  mensagem = "O seu perfil de acesso atual não possui permissão para visualizar esta funcionalidade.",
  voltarHref = "/painel",
}: AcessoNegadoProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4 shadow-sm border border-destructive/20">
        <ShieldAlert className="size-8" />
      </div>

      <h2 className="text-xl font-bold tracking-tight text-foreground font-heading mb-2">
        {titulo}
      </h2>

      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
        {mensagem}
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/painel">
            <Home className="size-4 mr-2" />
            Ir para o Início
          </Link>
        </Button>
        <Button asChild className="flex-1">
          <Link href={voltarHref}>
            <ArrowLeft className="size-4 mr-2" />
            Voltar
          </Link>
        </Button>
      </div>
    </div>
  );
}
