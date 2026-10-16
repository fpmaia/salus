"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/src/auth/client";

export function BotaoSair() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/entrar");
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
