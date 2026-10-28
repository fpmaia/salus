"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useAviso } from "@/components/avisos";
import { Button } from "@/components/ui/button";
import type { EstadoAcao } from "@/src/server/acao";

const inicial: EstadoAcao = { erro: null, sucesso: null };

type Props = {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  children?: React.ReactNode;
  textoBotao: string;
  textoPendente?: string;
  variante?: "default" | "outline" | "destructive" | "secondary";
  className?: string;
  /** Pede confirmação antes de enviar (ações destrutivas): o texto explica o impacto. */
  confirmar?: string;
  /** Renderiza conteúdo extra com o estado (ex.: link gerado). */
  depois?: (estado: EstadoAcao) => React.ReactNode;
  /** Chamado depois de cada ação concluída com sucesso. */
  aoConcluir?: (estado: EstadoAcao) => void;
  /** Botão desabilitado (o formulário continua montado para o aviso de sucesso aparecer). */
  desabilitado?: boolean;
};

/** Formulário ligado a uma Server Action, com estado pendente e mensagens. */
export function FormAcao({
  acao,
  children,
  textoBotao,
  textoPendente = "Salvando…",
  variante = "default",
  className,
  confirmar,
  depois,
  aoConcluir,
  desabilitado = false,
}: Props) {
  const [estado, executar, pendente] = useActionState(acao, inicial);
  const formulario = useRef<HTMLFormElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const aguardando = useRef<FormData | null>(null);
  // No painel, o sucesso vira aviso (sobrevive ao formulário remontar); fora dele, fica aqui.
  const avisar = useAviso();

  // Depois de hidratado, o envio vai pelo onSubmit (preventDefault impede o React de rodar
  // a prop action): assim o formulário só é resetado no sucesso, sem apagar o que o usuário
  // digitou num erro. A prop `action` continua lá para o envio antes da hidratação — sem
  // ela, o navegador faria um GET nativo com os campos (até senhas/chaves) na URL.
  useEffect(() => {
    if (estado.sucesso && !estado.erro) {
      formulario.current?.reset();
      avisar?.(estado.sucesso);
      aoConcluir?.(estado);
    }
    // avisar e aoConcluir fora das dependências: só reage a um novo resultado da ação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const enviar = (dados: FormData) => startTransition(() => executar(dados));

  return (
    <form
      ref={formulario}
      action={executar}
      className={className ?? "flex flex-col gap-3"}
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        if (confirmar) {
          aguardando.current = dados;
          dialogo.current?.showModal();
          return;
        }
        enviar(dados);
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variante} disabled={pendente || desabilitado}>
          {pendente ? textoPendente : textoBotao}
        </Button>
        {estado.erro && (
          <p role="alert" className="text-sm text-destructive">
            {estado.erro}
          </p>
        )}
        {!avisar && estado.sucesso && !estado.erro && <p className="text-sm text-muted-foreground">{estado.sucesso}</p>}
      </div>
      {depois?.(estado)}
      {confirmar && (
        <dialog
          ref={dialogo}
          aria-label="Confirmar ação"
          className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
          onClose={() => {
            aguardando.current = null;
          }}
        >
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm leading-relaxed">{confirmar}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => dialogo.current?.close()}>
                Voltar
              </Button>
              <Button
                type="button"
                variant={variante === "destructive" ? "destructive" : "default"}
                onClick={() => {
                  const dados = aguardando.current;
                  dialogo.current?.close();
                  if (dados) enviar(dados);
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </form>
  );
}
