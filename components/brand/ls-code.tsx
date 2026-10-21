import Image from "next/image";
import { cn } from "cn";

interface LSCodeBadgeProps {
  variant?: "badge" | "compact" | "footer";
  className?: string;
}

export function LSCodeBadge({ variant = "badge", className }: LSCodeBadgeProps) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className
        )}
      >
        <Image
          src="/images/logo-ls-code.png"
          alt="LS Code"
          width={18}
          height={18}
          className="size-4.5 rounded object-contain"
        />
        <span className="font-medium text-foreground/80">LS Code</span>
      </div>
    );
  }

  if (variant === "footer") {
    return (
      <div
        className={cn(
          "inline-flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground/80 transition-colors hover:text-foreground",
          className
        )}
      >
        <span>Desenvolvido com tecnologia de ponta por</span>
        <div className="inline-flex items-center gap-1.5 font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40 backdrop-blur-sm">
          <Image
            src="/images/logo-ls-code.png"
            alt="LS Code Logo"
            width={16}
            height={16}
            className="size-4 rounded object-contain"
          />
          <span className="tracking-wide">LS Code</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-md transition-all hover:border-primary/40 hover:text-foreground",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span>Desenvolvido por</span>
      <div className="flex items-center gap-1 font-semibold text-foreground">
        <Image
          src="/images/logo-ls-code.png"
          alt="LS Code Logo"
          width={16}
          height={16}
          className="size-3.5 rounded object-contain transition-transform group-hover:scale-110"
        />
        <span>LS Code</span>
      </div>
    </div>
  );
}
