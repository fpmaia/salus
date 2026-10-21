import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";

interface SalusLogoProps {
  variant?: "symbol" | "full";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  href?: string;
  priority?: boolean;
}

const DIMENSIONS = {
  symbol: {
    xs: { width: 22, height: 26, className: "h-6 w-auto" },
    sm: { width: 28, height: 32, className: "h-7 w-auto" },
    md: { width: 36, height: 42, className: "h-9 w-auto" },
    lg: { width: 48, height: 56, className: "h-12 w-auto" },
    xl: { width: 64, height: 75, className: "h-16 w-auto" },
  },
  full: {
    xs: { width: 90, height: 30, className: "h-6 w-auto" },
    sm: { width: 110, height: 36, className: "h-7 w-auto" },
    md: { width: 140, height: 46, className: "h-9 w-auto" },
    lg: { width: 180, height: 60, className: "h-12 w-auto" },
    xl: { width: 220, height: 73, className: "h-16 w-auto" },
  },
} as const;

export function SalusLogo({
  variant = "full",
  size = "md",
  className,
  href,
  priority = false,
}: SalusLogoProps) {
  const dim = DIMENSIONS[variant][size];

  const content = (
    <div className={cn("inline-flex items-center gap-2.5 transition-transform duration-200 hover:scale-[1.02]", className)}>
      {variant === "symbol" ? (
        <Image
          src="/images/salus-symbol.webp"
          alt="Salus Monograma"
          width={dim.width}
          height={dim.height}
          className={cn("object-contain drop-shadow-sm", dim.className)}
          priority={priority}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Image
            src="/images/salus-symbol.webp"
            alt="Salus"
            width={DIMENSIONS.symbol[size].width}
            height={DIMENSIONS.symbol[size].height}
            className={cn("object-contain drop-shadow-sm", DIMENSIONS.symbol[size].className)}
            priority={priority}
          />
          <span className="font-heading font-bold tracking-tight text-foreground text-xl sm:text-2xl">
            salus
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
        {content}
      </Link>
    );
  }

  return content;
}
