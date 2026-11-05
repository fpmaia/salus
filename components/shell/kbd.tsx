export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-2xs">
      {children}
    </kbd>
  );
}
