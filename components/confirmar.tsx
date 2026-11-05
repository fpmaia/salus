"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Pedido = { titulo: string; descricao?: string; confirmar?: string; destrutivo?: boolean };

/**
 * Confirmação em diálogo (no lugar de window.confirm): `const [confirmar, dialogo] = useConfirmar()`;
 * `if (await confirmar({ titulo: "…" })) …` e renderize `{dialogo}`.
 */
export function useConfirmar(): [(pedido: Pedido) => Promise<boolean>, React.ReactNode] {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback(
    (p: Pedido) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPedido(p);
      }),
    [],
  );

  const responder = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  };

  const dialogo = (
    <Dialog open={pedido !== null} onOpenChange={(aberto) => !aberto && responder(false)}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{pedido?.titulo}</DialogTitle>
          {pedido?.descricao && <DialogDescription>{pedido.descricao}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => responder(false)}>
            Voltar
          </Button>
          <Button type="button" variant={pedido?.destrutivo ? "destructive" : "default"} onClick={() => responder(true)} autoFocus>
            {pedido?.confirmar ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [confirmar, dialogo];
}
