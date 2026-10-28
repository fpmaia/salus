"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageSquare, Send } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoAcao } from "@/src/server/acao";

type Props = {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  pendente: boolean;
  nomeProfissional?: string;
};

/** Gera o link de convite e exibe diálogo persistente com atalho para WhatsApp. */
export function BotaoConvite({ acao, pendente, nomeProfissional }: Props) {
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

  return (
    <>
      <FormAcao
        acao={acao}
        textoBotao={pendente ? "Gerar novo link" : "Gerar convite"}
        textoPendente="Gerando…"
        variante="outline"
        confirmar={pendente ? "O link anterior deixará de funcionar. Continuar?" : undefined}
        aoConcluir={(estado) => {
          if (estado.dados?.link) {
            setLinkGerado(estado.dados.link);
          }
        }}
        depois={(estado) => (estado.dados?.link ? <LinkCopiavel link={estado.dados.link} nome={nomeProfissional} /> : null)}
      />

      {linkGerado && (
        <DialogoConviteGerado
          link={linkGerado}
          nome={nomeProfissional}
          aoFechar={() => setLinkGerado(null)}
        />
      )}
    </>
  );
}

function LinkCopiavel({ link, nome }: { link: string; nome?: string }) {
  const [copiado, setCopiado] = useState(false);
  const mensagem = `Olá${nome ? ` ${nome}` : ""}! Segue seu link de acesso à clínica no Salus: ${link}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <span className="font-semibold text-foreground">Link de acesso:</span>
      <div className="flex w-full gap-2">
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 3000);
          }}
        >
          {copiado ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          <span>{copiado ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
      <div className="flex items-center justify-end">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
        >
          <MessageSquare className="size-3.5" /> Enviar por WhatsApp
        </a>
      </div>
    </div>
  );
}

function DialogoConviteGerado({
  link,
  nome,
  aoFechar,
}: {
  link: string;
  nome?: string;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const mensagem = `Olá${nome ? ` ${nome}` : ""}! Segue seu link de acesso à clínica no Salus: ${link}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              Convite Gerado com Sucesso!
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {nome ? `O link de acesso para ${nome} está pronto.` : "Envie o link para o profissional criar a conta."}
            </p>
          </div>
          <button
            onClick={aoFechar}
            className="text-muted-foreground hover:text-foreground text-sm p-1 rounded-md"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
          <Label className="text-xs font-semibold">Link exclusivo (válido por 7 dias):</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="text-xs font-mono bg-background"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 3000);
              }}
            >
              {copiado ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              <span>{copiado ? "Copiado" : "Copiar"}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition-colors"
          >
            <Send className="size-3.5" /> Enviar por WhatsApp
          </a>
          <Button type="button" variant="outline" onClick={aoFechar} size="sm">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
