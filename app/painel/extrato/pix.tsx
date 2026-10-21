"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** QR Code e "copia e cola" de uma cobrança PIX. */
export function PixParaPagar({ copiaECola }: { copiaECola: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(copiaECola, { margin: 1, width: 220 }).then(setQr, () => setQr(null));
  }, [copiaECola]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem acesso à área de transferência: o código continua visível para copiar à mão.
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL gerada no navegador
        <img src={qr} alt="QR Code PIX" width={180} height={180} className="rounded-md border bg-white p-1" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs text-muted-foreground">Abra o app do seu banco, escolha PIX e leia o QR Code ou cole o código abaixo.</p>
        <code className="block max-h-24 overflow-auto break-all rounded-md bg-muted px-2 py-1.5 text-xs">{copiaECola}</code>
        <Button type="button" size="sm" variant={copiado ? "default" : "outline"} onClick={copiar} className="w-fit gap-1.5">
          {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copiado ? "Código copiado" : "Copiar código PIX"}
        </Button>
      </div>
    </div>
  );
}
