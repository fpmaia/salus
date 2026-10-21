"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/src/auth/client";

type Etapa = { tipo: "inicio" } | { tipo: "escanear"; qr: string; segredo: string; codigos: string[] } | { tipo: "codigos"; codigos: string[] };

/** Ativar (senha → QR → código), ver códigos de recuperação e desativar. */
export function ConfigurarDoisFatores({ ativo, obrigatorio }: { ativo: boolean; obrigatorio: boolean }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function executar(fn: () => Promise<void>) {
    setEnviando(true);
    setErro(null);
    try {
      await fn();
    } finally {
      setEnviando(false);
    }
  }

  const ativar = (formData: FormData) =>
    executar(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password: String(formData.get("senha")) });
      if (error || !data || !("totpURI" in data)) return setErro("Senha incorreta.");
      const segredo = new URL(data.totpURI).searchParams.get("secret") ?? "";
      setEtapa({ tipo: "escanear", qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }), segredo, codigos: data.backupCodes });
    });

  const confirmar = (formData: FormData) =>
    executar(async () => {
      if (etapa.tipo !== "escanear") return;
      const { error } = await authClient.twoFactor.verifyTotp({ code: String(formData.get("codigo")).replace(/\s/g, "") });
      if (error) return setErro("Código inválido. Confira o horário do celular e tente de novo.");
      setEtapa({ tipo: "codigos", codigos: etapa.codigos });
    });

  const desativar = (formData: FormData) =>
    executar(async () => {
      const { error } = await authClient.twoFactor.disable({ password: String(formData.get("senha")) });
      if (error) return setErro("Senha incorreta.");
      router.refresh();
    });

  const novosCodigos = (formData: FormData) =>
    executar(async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: String(formData.get("senha")) });
      if (error || !data) return setErro("Senha incorreta.");
      setEtapa({ tipo: "codigos", codigos: data.backupCodes });
    });

  if (etapa.tipo === "codigos") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="font-medium">Guarde estes códigos de recuperação num lugar seguro.</p>
        <p className="text-muted-foreground">Cada um entra uma única vez, se você perder o celular. Eles não serão mostrados de novo.</p>
        <ul className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {etapa.codigos.map((c) => (
            <li key={c} className="list-none">
              {c}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            router.push("/painel");
            router.refresh();
          }}
        >
          Guardei, continuar
        </Button>
      </div>
    );
  }

  if (etapa.tipo === "escanear") {
    return (
      <form action={confirmar} className="flex flex-col gap-3 text-sm">
        <p>Escaneie o QR com o app autenticador (Google Authenticator, Microsoft Authenticator, 1Password…):</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado localmente (data URL) */}
        <img src={etapa.qr} alt="QR code para o app autenticador" width={220} height={220} className="self-center rounded-md border" />
        <p className="text-xs text-muted-foreground">
          Sem câmera? Digite a chave: <code className="break-all font-mono">{etapa.segredo}</code>
        </p>
        <Label htmlFor="codigo-2fa">Código de 6 dígitos que aparece no app</Label>
        <Input id="codigo-2fa" name="codigo" required inputMode="numeric" autoComplete="one-time-code" />
        {erro && <p className="text-destructive">{erro}</p>}
        <Button type="submit" disabled={enviando}>
          {enviando ? "Confirmando…" : "Confirmar e ativar"}
        </Button>
      </form>
    );
  }

  if (ativo) {
    return (
      <div className="flex flex-col gap-5 text-sm">
        <p className="font-medium text-success">A verificação em duas etapas está ativa.</p>
        <form action={novosCodigos} className="flex flex-col gap-2">
          <Label htmlFor="senha-codigos">Gerar novos códigos de recuperação (os antigos deixam de valer)</Label>
          <Input id="senha-codigos" name="senha" type="password" required placeholder="Sua senha" autoComplete="current-password" />
          <Button type="submit" variant="outline" disabled={enviando}>
            Gerar novos códigos
          </Button>
        </form>
        {!obrigatorio && (
          <form action={desativar} className="flex flex-col gap-2 border-t pt-4">
            <Label htmlFor="senha-desativar">Desativar a verificação em duas etapas</Label>
            <Input id="senha-desativar" name="senha" type="password" required placeholder="Sua senha" autoComplete="current-password" />
            <Button type="submit" variant="destructive" disabled={enviando}>
              Desativar
            </Button>
          </form>
        )}
        {erro && <p className="text-destructive">{erro}</p>}
      </div>
    );
  }

  return (
    <form action={ativar} className="flex flex-col gap-3 text-sm">
      <Label htmlFor="senha-ativar">Confirme sua senha para começar</Label>
      <Input id="senha-ativar" name="senha" type="password" required autoComplete="current-password" />
      {erro && <p className="text-destructive">{erro}</p>}
      <Button type="submit" disabled={enviando}>
        {enviando ? "Preparando…" : "Ativar verificação em duas etapas"}
      </Button>
    </form>
  );
}
