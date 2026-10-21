import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigir2FAParaAdmin } from "@/src/auth/dois-fatores";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarMembershipsDoUsuario } from "@/src/server/memberships";
import { ehSuperadmin } from "@/src/server/plataforma";
import { ConfigurarDoisFatores } from "./configurar";

// Fora do /painel: o portão do 2FA manda os admins para cá, e esta página não pode depender dele.
export default async function DoisFatoresPage({ searchParams }: PageProps<"/seguranca/dois-fatores">) {
  const usuario = await exigirUsuario();
  const { obrigatorio } = await searchParams;
  const administra =
    (await ehSuperadmin(usuario.id)) || (await listarMembershipsDoUsuario(usuario.id)).some((m) => m.role === "admin");
  const exigido = administra && exigir2FAParaAdmin();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <CardDescription>
          {obrigatorio && !usuario.twoFactorEnabled
            ? "Quem administra o espaço precisa ativar a verificação em duas etapas antes de continuar: ela protege os dados dos pacientes mesmo se a sua senha vazar."
            : "Além da senha, o login pede um código do app autenticador do seu celular."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ConfigurarDoisFatores ativo={Boolean(usuario.twoFactorEnabled)} obrigatorio={exigido} />
        {usuario.twoFactorEnabled && (
          <Link href="/painel" className="text-xs text-muted-foreground hover:underline">
            Voltar ao painel
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
