"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { conectarWhatsappAcao, verificarWhatsappAcao } from "./actions";

/** Aceite do risco → QR Code → espera o celular ler (consulta o estado a cada 3 s). */
export function ConectarWhatsapp({ jaAceitou }: { jaAceitou: boolean }) {
  const router = useRouter();
  const [aceito, setAceito] = useState(jaAceitou);
  const [qr, setQr] = useState<{ imagem: string | null; codigo: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const gerar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await conectarWhatsappAcao(aceito);
      if (!r.ok) return setErro(r.erro);
      const imagem = r.qrBase64 ? (r.qrBase64.startsWith("data:") ? r.qrBase64 : `data:image/png;base64,${r.qrBase64}`) : null;
      setQr({ imagem, codigo: r.codigoPareamento });
    });

  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      const r = await verificarWhatsappAcao();
      if (r.ok && r.status === "conectado") {
        clearInterval(t);
        setQr(null);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [qr, router]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-1" />
        <span>
          Entendo que a conexão por QR Code não é a API oficial do WhatsApp e que o número pode ser bloqueado pelo WhatsApp.
          <span className="block text-xs text-muted-foreground">Use um número só do espaço (não o pessoal) e evite enviar mensagens em massa.</span>
        </span>
      </label>
      <Button type="button" className="w-fit" onClick={gerar} disabled={!aceito || pendente}>
        {pendente ? "Gerando…" : qr ? "Gerar novo QR Code" : "Conectar WhatsApp"}
      </Button>
      {erro && <p className="text-destructive">{erro}</p>}
      {qr && (
        <div className="flex flex-wrap items-start gap-4 rounded-md border p-3">
          {qr.imagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR Code em data URL vindo da Evolution
            <img src={qr.imagem} alt="QR Code para conectar o WhatsApp" width={220} height={220} className="rounded-md bg-white p-1" />
          ) : (
            <p className="text-muted-foreground">A Evolution não devolveu o QR Code. Tente gerar de novo.</p>
          )}
          <div className="flex max-w-sm flex-col gap-1 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">No celular do espaço:</p>
            <p>WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho, e leia o QR Code.</p>
            {qr.codigo && <p>Ou use o código de pareamento: <code className="font-mono text-foreground">{qr.codigo}</code></p>}
            <p>O QR Code expira em cerca de 40 segundos: se expirar, gere um novo. Esta tela atualiza sozinha ao conectar.</p>
          </div>
        </div>
      )}
    </div>
  );
}
