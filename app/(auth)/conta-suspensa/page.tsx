import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirUsuario } from "@/src/auth/sessao";
import { listarMembershipsDoUsuario, usuarioTemEspacoBloqueado } from "@/src/server/memberships";
import { BotaoSair } from "@/app/painel/botao-sair";
import { motivoDoBloqueio } from "@/src/server/plataforma-clinica";

// Espaço suspenso ou cancelado pela plataforma (não é o atraso de fatura, que deixa o painel só leitura).
export default async function ContaSuspensaPage() {
  const usuario = await exigirUsuario();
  if ((await listarMembershipsDoUsuario(usuario.id)).length > 0) redirect("/painel");
  if (!(await usuarioTemEspacoBloqueado(usuario.id))) redirect("/onboarding");
  const numero = (process.env.SALUS_WHATSAPP_COMERCIAL ?? "").replace(/\D/g, "");
  const bloqueio = await motivoDoBloqueio(usuario.id);
  const cancelado = bloqueio?.status === "cancelado";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cancelado ? "Conta do espaço cancelada" : "Acesso ao espaço suspenso"}</CardTitle>
        <CardDescription>
          O espaço do qual você participa foi {cancelado ? "cancelado" : "suspenso"} pela equipe Salus. Os dados continuam guardados com
          segurança{cancelado ? "." : "; o acesso volta assim que a situação for resolvida."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {bloqueio?.motivo && (
          <p className="rounded-lg bg-muted p-3">
            <strong>Motivo:</strong> {bloqueio.motivo}
          </p>
        )}
        <p>Se você administra o espaço, fale com o suporte para entender o motivo e reativar.</p>
        {numero && (
          <a
            href={`https://wa.me/${numero}?text=${encodeURIComponent("Olá! Meu espaço no Salus está suspenso e preciso de ajuda.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Falar com o suporte no WhatsApp
          </a>
        )}
        <BotaoSair />
      </CardContent>
    </Card>
  );
}
