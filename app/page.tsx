import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-2xl font-semibold text-primary-foreground">
        S
      </span>
      <h1 className="text-4xl font-semibold tracking-tight">Salus</h1>
      <p className="text-lg text-muted-foreground">
        Gestão de coworkings de saúde: locação de salas, agenda de pacientes e
        financeiro de cobranças e repasses.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/entrar">Entrar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cadastro">Criar conta</Link>
        </Button>
      </div>
    </main>
  );
}
