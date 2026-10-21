import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { listarNotificacoes } from "@/src/server/notificacoes";
import { conexaoWhatsapp } from "@/src/server/whatsapp";
import { desconectarWhatsappAcao, reenviarNotificacaoAcao } from "./actions";
import { ConectarWhatsapp } from "./conexao-whatsapp";

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

const ROTULO_TIPO: Record<string, string> = {
  lembrete_agendamento: "Lembrete ao paciente",
  lembrete_reserva: "Lembrete de reserva",
  cancelamento_agendamento: "Aviso de cancelamento ao paciente",
  cancelamento_reserva: "Aviso de cancelamento de reserva",
};

export default async function NotificacoesPage({ searchParams }: PageProps<"/painel/notificacoes">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "auditoria.ver");
  const { status } = await searchParams;
  const filtro = typeof status === "string" ? status : "";
  const notificacoes = await listarNotificacoes(ctx, { status: filtro || undefined });
  const provider =
    process.env.WHATSAPP_PROVIDER === "meta"
      ? "WhatsApp Cloud API"
      : process.env.WHATSAPP_PROVIDER === "evolution"
        ? "o WhatsApp do espaço (QR Code)"
        : "console (desenvolvimento: nada é enviado de verdade)";
  const whatsapp = await conexaoWhatsapp(ctx);
  const conexao = whatsapp.conexao;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      {whatsapp.disponivel && (
        <Card className={conexao?.status === "conectado" ? undefined : "border-amber-500/50"}>
          <CardHeader>
            <CardTitle>WhatsApp do espaço</CardTitle>
            <CardDescription>
              {conexao?.status === "conectado"
                ? `Conectado${conexao.numero ? ` (+${conexao.numero})` : ""}: os lembretes saem por este número.`
                : `Desconectado: ${whatsapp.pendentes ? `${whatsapp.pendentes} mensagem(ns) esperando na fila` : "nenhum lembrete é enviado"} até conectar.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {conexao?.status === "conectado" ? (
              <FormAcao
                acao={desconectarWhatsappAcao}
                textoBotao="Desconectar"
                textoPendente="Desconectando…"
                variante="outline"
                confirmar="Desconectar o WhatsApp? Os lembretes ficam na fila até conectar de novo."
              />
            ) : (
              <ConectarWhatsapp jaAceitou={Boolean(conexao?.riscoAceitoEm)} />
            )}
          </CardContent>
        </Card>
      )}
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
                      {ROTULO_TIPO[n.tipo]} · {n.destinatario}
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
