import { Sparkles } from "lucide-react";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarPlanosCompletosPlataforma } from "@/src/server/plataforma";
import { PainelPlanos } from "./painel-planos";

export default async function PlanosPlataformaPage() {
  const usuario = await exigirUsuario();
  const planos = await listarPlanosCompletosPlataforma(usuario.id);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Planos e Precificação SaaS</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3" /> Faturamento Automático
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure as modalidades de planos (Básico, Pro, Enterprise), limites inclusos, regras de overage e add-on de Prontuário EHR.
          </p>
        </div>
      </div>

      <PainelPlanos planos={planos} />
    </main>
  );
}
