import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarMembershipsDoUsuario, usuarioTemEspacoBloqueado } from "@/src/server/memberships";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { FormularioOnboarding } from "./formulario";

export default async function OnboardingPage() {
  const usuario = await exigirUsuario();
  const memberships = await listarMembershipsDoUsuario(usuario.id);
  if (memberships.length > 0) redirect("/painel");
  if (await usuarioTemEspacoBloqueado(usuario.id)) redirect("/conta-suspensa");

  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-12 selection:bg-primary/20 selection:text-primary">
      {/* Background Decorativo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <SalusLogo href="/" size="lg" priority />

        <Card className="w-full border-border/70 bg-card/95 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="space-y-1.5 pb-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1">
              <Building2 className="size-5" />
            </div>
            <CardTitle className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Cadastre o seu espaço
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">
              Olá, <span className="font-medium text-foreground">{usuario.name}</span>. Você será o administrador deste espaço.
            </CardDescription>
          </CardHeader>

          <FormularioOnboarding />
        </Card>

        <LSCodeBadge variant="compact" />
      </div>
    </main>
  );
}
