import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SalusLogo } from "@/components/brand/salus-logo";
import { obterContextoTenant } from "@/src/auth/sessao";
import { gerarMinutaContratoPadrao } from "@/src/domain/contratos";
import { dadosDaMinuta, obterContrato } from "@/src/server/contratos";
import { mensagemDeErro } from "@/src/server/erros";
import { BotaoDispararImpressao } from "@/components/botao-imprimir";

// Impressão / PDF: os termos do contrato ou, sem eles, a minuta padrão com as condições atuais.
export default async function ImprimirContratoPage({ params }: PageProps<"/painel/contratos/[id]/imprimir">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  const naoEncontrado = (erro: unknown) => {
    if (mensagemDeErro(erro)) notFound();
    throw erro;
  };
  const [detalhe, dados] = await Promise.all([obterContrato(ctx, id).catch(naoEncontrado), dadosDaMinuta(ctx, id).catch(naoEncontrado)]);
  const texto = detalhe.contrato.termos || gerarMinutaContratoPadrao(dados);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 text-foreground print:bg-white sm:px-6">
      <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between print:hidden">
        <Link href={`/painel/contratos/${id}`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar ao contrato
        </Link>
        <BotaoDispararImpressao />
      </div>

      <div className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-white p-8 text-black shadow-lg print:rounded-none print:border-none print:p-0 print:shadow-none sm:p-14">
        <header className="mb-8 flex items-start justify-between border-b-2 border-primary/20 pb-6">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">{dados.clinicaNome}</h1>
            {dados.clinicaDocumento && <p className="text-xs text-neutral-600">{dados.clinicaDocumento}</p>}
          </div>
          <div className="flex flex-col items-end space-y-1 text-right">
            <SalusLogo variant="symbol" size="sm" priority />
            <span className="font-mono text-xs font-bold text-neutral-800">{dados.codigo}</span>
          </div>
        </header>
        <article className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-800">{texto}</article>
        <footer className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-6 text-[10px] text-neutral-500">
          <span>Salus</span>
          <span>{dados.codigo}</span>
        </footer>
      </div>
    </div>
  );
}
