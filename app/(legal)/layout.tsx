import { SalusLogo } from "@/components/brand/salus-logo";
import { RodapeLegal } from "@/components/rodape-legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <header className="border-b px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <SalusLogo href="/" size="sm" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <article className="flex flex-col gap-4 text-sm leading-relaxed text-foreground [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
          {children}
        </article>
      </main>
      <footer className="border-t px-4 py-6">
        <RodapeLegal />
      </footer>
    </div>
  );
}
