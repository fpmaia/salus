import { notFound } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { obterContextoTenant } from "@/src/auth/sessao";
import { obterContrato } from "@/src/server/contratos";
import { SalusLogo } from "@/components/brand/salus-logo";
import { BotaoDispararImpressao } from "./botao-disparar-impressao";

export default async function ImprimirContratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await obterContextoTenant();

  let contrato;
  try {
    contrato = await obterContrato(ctx, id);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white text-foreground py-6 px-4 sm:px-6">
      {/* Barra de Ações Superior (Oculta na Impressão) */}
      <div className="mx-auto max-w-4xl mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/painel/contratos/${contrato.id}`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> Voltar aos detalhes do contrato
        </Link>

        <div className="flex items-center gap-2">
          <BotaoDispararImpressao />
        </div>
      </div>

      {/* Folha Timbrada A4 */}
      <div className="mx-auto max-w-4xl bg-white text-black p-8 sm:p-14 rounded-2xl shadow-lg border border-border/60 print:border-none print:shadow-none print:p-0 print:rounded-none">
        {/* Cabeçalho Oficial */}
        <header className="flex items-start justify-between border-b-2 border-primary/20 pb-6 mb-8">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              {contrato.clinica.nome}
            </h1>
            {contrato.clinica.documento && (
              <p className="text-xs text-neutral-600">
                CNPJ/MF: {contrato.clinica.documento}
              </p>
            )}
            <p className="text-xs text-neutral-500">
              Espaço de Saúde Compartilhado · Gestão e Locação de Consultórios
            </p>
          </div>

          <div className="flex flex-col items-end text-right space-y-1">
            <SalusLogo variant="symbol" size="sm" priority />
            <span className="font-mono text-xs font-bold text-neutral-800">
              {contrato.codigo}
            </span>
            <span className="text-[10px] text-neutral-500">
              Emissão: {new Date().toLocaleDateString("pt-BR")}
            </span>
          </div>
        </header>

        {/* Corpo do Contrato */}
        <article className="text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed font-sans space-y-4">
          {contrato.termosContrato}
        </article>

        {/* Rodapé do Documento */}
        <footer className="mt-12 pt-6 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-500">
          <span>Salus • Gestão de Saúde Integrada</span>
          <span>
            {contrato.codigo} · Documento gerado em {new Date().toLocaleString("pt-BR")}
          </span>
        </footer>
      </div>
    </div>
  );
}
