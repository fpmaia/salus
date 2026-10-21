"use client";

import { useActionState } from "react";
import { Laptop, LogOut, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import type { SessaoAtiva } from "@/src/server/perfil";
import { revogarOutrasSessoesAcao, revogarSessaoAcao } from "@/app/painel/perfil/actions";

interface Props {
  sessoes: SessaoAtiva[];
}

export function SessoesAtivasLista({ sessoes }: Props) {
  const [estadoRevogar, acaoRevogar, pendenteRevogar] = useActionState(revogarSessaoAcao, null);
  const [estadoOutras, acaoOutras, pendenteOutras] = useActionState(revogarOutrasSessoesAcao, null);

  const getDeviceIcon = (ua: string | null) => {
    const texto = (ua || "").toLowerCase();
    if (texto.includes("iphone") || texto.includes("android") || texto.includes("mobile")) {
      return <Smartphone className="size-4 text-primary" />;
    }
    return <Laptop className="size-4 text-primary" />;
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return "Navegador web";
    if (ua.includes("iPhone")) return "iPhone (Safari Mobile)";
    if (ua.includes("Android")) return "Android (Chrome Mobile)";
    if (ua.includes("Macintosh")) return "Mac (macOS)";
    if (ua.includes("Windows")) return "Windows PC";
    if (ua.includes("Linux")) return "Linux";
    return "Navegador Web";
  };

  return (
    <div className="space-y-4">
      {estadoRevogar?.mensagem && (
        <div className="rounded-xl border border-success/20 bg-success/10 p-3 text-xs text-success">
          {estadoRevogar.mensagem}
        </div>
      )}

      {estadoOutras?.mensagem && (
        <div className="rounded-xl border border-success/20 bg-success/10 p-3 text-xs text-success">
          {estadoOutras.mensagem}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Dispositivos onde você está conectado atualmente ({sessoes.length})
        </span>

        {sessoes.length > 1 && (
          <form action={acaoOutras}>
            <button
              type="submit"
              disabled={pendenteOutras}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 px-2.5 py-1 text-xs font-medium transition-colors"
            >
              <LogOut className="size-3" />
              {pendenteOutras ? "Encerrando..." : "Sair de todos os outros dispositivos"}
            </button>
          </form>
        )}
      </div>

      <div className="divide-y divide-border/40 rounded-xl border border-border/80 bg-background overflow-hidden">
        {sessoes.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                {getDeviceIcon(s.userAgent)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {parseUserAgent(s.userAgent)}
                  </span>
                  {s.ehAtual && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2 py-0.2 text-[10px] font-semibold text-success">
                      <ShieldCheck className="size-2.5" /> Sessão Atual
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  <span>IP: {s.ipAddress || "Localhost"}</span>
                  <span>•</span>
                  <span>Iniciada em {new Date(s.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>

            {!s.ehAtual && (
              <form action={acaoRevogar}>
                <input type="hidden" name="sessionId" value={s.id} />
                <button
                  type="submit"
                  disabled={pendenteRevogar}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Encerrar esta sessão"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
