import Link from "next/link";
import { SalusLogo } from "@/components/brand/salus-logo";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { RodapeLegal } from "@/components/rodape-legal";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-12 selection:bg-primary/20 selection:text-primary">
      {/* Background Decorativo */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 size-80 rounded-full bg-success/8 blur-[100px]" />
      </div>

      {/* Container Principal */}
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        {/* Logo Salus Oficial */}
        <SalusLogo href="/" size="lg" priority />

        {/* Formulário / Card */}
        <div className="w-full animate-in fade-in zoom-in-95 duration-200">
          {children}
        </div>

        {/* Assinatura LS Code */}
        <div className="mt-2 flex flex-col items-center gap-2">
          <LSCodeBadge variant="compact" />
          <RodapeLegal />
        </div>
      </div>
    </main>
  );
}
