import { Loader2 } from "lucide-react";

export default function PainelLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded-md bg-muted/60" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-muted" />
      </div>

      {/* Grid cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-2xl border border-border/60 bg-card/60 p-4" />
        <div className="h-32 rounded-2xl border border-border/60 bg-card/60 p-4" />
        <div className="h-32 rounded-2xl border border-border/60 bg-card/60 p-4" />
      </div>

      {/* Main card skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded-md bg-muted" />
          <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
        </div>
        <div className="space-y-2.5">
          <div className="h-10 w-full rounded-xl bg-muted/40" />
          <div className="h-10 w-full rounded-xl bg-muted/40" />
          <div className="h-10 w-full rounded-xl bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
