"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/src/auth/client";

export function BotaoSair({ destino = "/entrar" }: { destino?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      onClick={async () => {
        await authClient.signOut();
        router.push(destino);
        router.refresh();
      }}
      title="Encerrar sessão"
    >
      <LogOut className="size-3.5" />
      <span className="hidden sm:inline">Sair</span>
    </Button>
  );
}
