"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
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
  /** Pede confirmação antes de enviar (ações destrutivas). */
  confirmar?: string;
  /** Renderiza conteúdo extra com o estado (ex.: link gerado). */
  depois?: (estado: EstadoAcao) => React.ReactNode;
  /** Chamado depois de cada ação concluída com sucesso. */
  aoConcluir?: (estado: EstadoAcao) => void;
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
}: Props) {
  const [estado, executar, pendente] = useActionState(acao, inicial);
  const formulario = useRef<HTMLFormElement>(null);

  // Depois de hidratado, o envio vai pelo onSubmit (preventDefault impede o React de rodar
  // a prop action): assim o formulário só é resetado no sucesso, sem apagar o que o usuário
  // digitou num erro. A prop `action` continua lá para o envio antes da hidratação — sem
  // ela, o navegador faria um GET nativo com os campos (até senhas/chaves) na URL.
  useEffect(() => {
    if (estado.sucesso && !estado.erro) {
      formulario.current?.reset();
      aoConcluir?.(estado);
    }
    // aoConcluir fora das dependências: só reage a um novo resultado da ação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form
      ref={formulario}
      action={executar}
      className={className ?? "flex flex-col gap-3"}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (confirmar && !window.confirm(confirmar)) return;
        const dados = new FormData(evento.currentTarget);
        startTransition(() => executar(dados));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variante} disabled={pendente}>
          {pendente ? textoPendente : textoBotao}
        </Button>
        {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
        {estado.sucesso && !estado.erro && <p className="text-sm text-muted-foreground">{estado.sucesso}</p>}
      </div>
      {depois?.(estado)}
    </form>
  );
}
