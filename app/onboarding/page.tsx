import { redirect } from "next/navigation";
import { Building2, Gift } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirUsuario } from "@/src/auth/sessao";
import { obterConviteClinicaPublico } from "@/src/server/convites-clinica";
import { listarMembershipsDoUsuario, usuarioTemEspacoBloqueado } from "@/src/server/memberships";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { FormularioOnboarding } from "./formulario";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const usuario = await exigirUsuario();
  const memberships = await listarMembershipsDoUsuario(usuario.id);
  if (memberships.length > 0) redirect("/painel");
  if (await usuarioTemEspacoBloqueado(usuario.id)) redirect("/conta-suspensa");
  // Convite trial válido e para este e-mail: o espaço nasce no plano do convite, em teste.
  const { trial } = await searchParams;
  const convite = typeof trial === "string" ? await obterConviteClinicaPublico(trial) : null;
  const teste =
    convite?.situacao === "pendente" && convite.email.toLowerCase() === usuario.email.toLowerCase() && typeof trial === "string"
      ? { token: trial, planoNome: convite.planoNome, diasTeste: convite.diasTeste }
      : null;

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

          {teste && (
            <div className="mx-6 mb-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              <Gift className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong>Teste grátis de {teste.diasTeste} dias no plano {teste.planoNome}.</strong> Sem cobrança durante o teste; a
                primeira fatura só vem no mês seguinte ao fim dele.
              </span>
            </div>
          )}
          <FormularioOnboarding conviteTrial={teste?.token} />
        </Card>

        <LSCodeBadge variant="compact" />
      </div>
    </main>
  );
}
