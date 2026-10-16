import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { listarNotificacoes } from "@/src/server/notificacoes";
import { reenviarNotificacaoAcao } from "./actions";

const FILTROS = [
  ["", "Todas"],
  ["pendente", "Pendentes"],
  ["enviado", "Enviadas"],
  ["falhou", "Falharam"],
  ["cancelado", "Canceladas"],
] as const;

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  enviando: "Enviando",
  enviado: "Enviada",
  falhou: "Falhou",
  cancelado: "Cancelada",
};

export default async function NotificacoesPage({ searchParams }: PageProps<"/painel/notificacoes">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "auditoria.ver");
  const { status } = await searchParams;
  const filtro = typeof status === "string" ? status : "";
  const notificacoes = await listarNotificacoes(ctx, { status: filtro || undefined });
  const provider = process.env.WHATSAPP_PROVIDER === "meta" ? "WhatsApp Cloud API" : "console (desenvolvimento: nada é enviado de verdade)";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>
            Lembretes D-1 para pacientes que consentiram e para profissionais com reserva. Envio via {provider}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav className="flex flex-wrap gap-2 text-sm">
            {FILTROS.map(([valor, rotulo]) => (
              <Link
                key={valor}
                href={valor ? `/painel/notificacoes?status=${valor}` : "/painel/notificacoes"}
                className={`rounded-md px-2 py-1 ${filtro === valor ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-muted"}`}
              >
                {rotulo}
              </Link>
            ))}
          </nav>
          {notificacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            <ul className="divide-y">
              {notificacoes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {n.tipo === "lembrete_agendamento" ? "Lembrete ao paciente" : "Lembrete de reserva"} · {n.destinatario}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ROTULO_STATUS[n.status]}
                      {n.tentativas > 0 && ` · ${n.tentativas} tentativa(s)`} ·{" "}
                      {(n.enviadoEm ?? n.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.texto.replace(/https?:\/\/\S+\/c\/\S+/, "[link do paciente]")}</p>
                  {n.ultimoErro && <p className="text-xs text-destructive">{n.ultimoErro}</p>}
                  {n.status === "falhou" && (
                    <FormAcao
                      acao={reenviarNotificacaoAcao.bind(null, n.id)}
                      textoBotao="Tentar de novo"
                      textoPendente="…"
                      variante="outline"
                      className="flex items-center gap-2"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
