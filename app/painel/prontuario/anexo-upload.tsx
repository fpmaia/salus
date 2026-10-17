"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Upload de anexo para um rascunho (rota própria: sem o limite de corpo das Server Actions). */
export function AnexoUpload({ registroId }: { registroId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);

  async function enviar(formData: FormData) {
    setEnviando(true);
    setMensagem(null);
    formData.set("registroId", registroId);
    const resposta = await fetch("/api/prontuario/anexos", { method: "POST", body: formData });
    const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
    setEnviando(false);
    if (!resposta.ok) {
      setMensagem({ erro: true, texto: corpo.erro ?? "Falha no envio" });
      return;
    }
    setMensagem({ erro: false, texto: "Anexo incluído" });
    router.refresh();
  }

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="file" name="arquivo" accept="application/pdf,image/jpeg,image/png,image/webp" required className="max-w-60 text-xs" aria-label="Arquivo" />
      <Button type="submit" variant="outline" size="sm" disabled={enviando}>
        {enviando ? "Enviando…" : "Anexar"}
      </Button>
      {mensagem && <span className={mensagem.erro ? "text-destructive" : "text-muted-foreground"}>{mensagem.texto}</span>}
    </form>
  );
}
