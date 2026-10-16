import { redirect } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarMembershipsDoUsuario } from "@/src/server/memberships";
import { FormularioOnboarding } from "./formulario";

export default async function OnboardingPage() {
  const usuario = await exigirUsuario();
  const memberships = await listarMembershipsDoUsuario(usuario.id);
  if (memberships.length > 0) redirect("/painel");

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cadastre o seu espaço</CardTitle>
          <CardDescription>
            Olá, {usuario.name}. Você será o administrador deste espaço.
          </CardDescription>
        </CardHeader>
        <FormularioOnboarding />
      </Card>
    </main>
  );
}
