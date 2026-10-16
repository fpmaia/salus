"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/src/auth/client";

export function BotaoSair({ destino = "/entrar" }: { destino?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push(destino);
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
