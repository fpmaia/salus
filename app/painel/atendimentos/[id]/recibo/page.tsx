import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BotaoDispararImpressao } from "@/components/botao-imprimir";
import { obterContextoTenant } from "@/src/auth/sessao";
import { formatarCpfCnpj } from "@/src/domain/documentos";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { mensagemDeErro } from "@/src/server/erros";
import { dadosDoRecibo } from "@/src/server/recibos";
import { formatarDataBr } from "@/src/server/reservas";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataPorExtenso = (d: string) => `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;

// Recibo do atendimento (impressão / PDF pelo navegador).
export default async function ReciboPage({ params }: PageProps<"/painel/atendimentos/[id]/recibo">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  const r = await dadosDoRecibo(ctx, id).catch((erro) => {
    if (mensagemDeErro(erro)) notFound();
    throw erro;
  });
  const conselho = [r.profissional.conselho, r.profissional.registro].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 text-foreground print:bg-white sm:px-6">
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between print:hidden">
        <Link href="/painel/atendimentos" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Atendimentos
        </Link>
        <BotaoDispararImpressao />
      </div>

      <div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-white p-8 text-black shadow-lg print:rounded-none print:border-none print:p-0 print:shadow-none sm:p-12">
        <header className="mb-8 flex items-start justify-between gap-4 border-b-2 border-neutral-200 pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Recibo</h1>
            <p className="font-mono text-xs text-neutral-600">Nº {r.numero}</p>
          </div>
          <p className="rounded-lg border-2 border-neutral-800 px-4 py-2 text-xl font-bold tabular-nums">{formatarMoeda(r.valorCentavos)}</p>
        </header>

        <article className="space-y-4 text-sm leading-relaxed text-neutral-800">
          <p>
            Recebi de <strong>{r.pagador.nome}</strong>
            {r.pagador.cpf && <>, CPF {formatarCpfCnpj(r.pagador.cpf)}</>}
            {r.pagador.nome !== r.paciente.nome && <>, responsável legal{r.pagador.parentesco ? ` (${r.pagador.parentesco})` : ""}</>}, a quantia de{" "}
            <strong>{formatarMoeda(r.valorCentavos)}</strong> ({r.valorPorExtenso}), referente a atendimento
            {r.profissional.especialidade ? ` de ${r.profissional.especialidade.toLowerCase()}` : ""} realizado em {formatarDataBr(r.data)}, às{" "}
            {r.hora}.
          </p>
          {r.pagador.nome !== r.paciente.nome && (
            <p>
              Paciente: <strong>{r.paciente.nome}</strong>
              {r.paciente.cpf && <>, CPF {formatarCpfCnpj(r.paciente.cpf)}</>}.
            </p>
          )}
          {r.recebidoPeloEspaco && (
            <p className="text-xs text-neutral-600">
              Valor recebido por {r.espaco.nome} ({formatarCpfCnpj(r.espaco.documento)}) em nome do profissional.
            </p>
          )}
          <p>
            Local: {r.local.unidade}
            {r.local.endereco && ` — ${r.local.endereco}`}.
          </p>
        </article>

        <footer className="mt-16 flex flex-col items-center gap-1 text-sm text-neutral-800">
          <p className="mb-10 self-end text-xs text-neutral-600">{dataPorExtenso(r.data)}</p>
          <span className="w-72 border-t border-neutral-800" />
          <p className="font-semibold">{r.profissional.nome}</p>
          {conselho && <p className="text-xs">{conselho}</p>}
          {r.profissional.documento && <p className="text-xs">CPF/CNPJ {formatarCpfCnpj(r.profissional.documento)}</p>}
        </footer>
      </div>
    </div>
  );
}
