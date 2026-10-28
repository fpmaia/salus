import { notFound } from "next/navigation";
import { exigirModuloNaPagina, exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ErroNegocio } from "@/src/server/erros";
import { exportarRegistroIndividual, horarioLocal } from "@/src/server/prontuario";
import { formatarDataBr } from "@/src/server/reservas";
import { BotaoImprimir } from "../../../botao-imprimir";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImprimirRelatorioIndividualPage({
  params,
}: {
  params: Promise<{ pacienteId: string; registroId: string }>;
}) {
  const { pacienteId, registroId } = await params;
  if (!UUID.test(pacienteId) || !UUID.test(registroId)) notFound();

  const ctx = await obterContextoTenant();
  await exigirModuloNaPagina(ctx, "prontuario");
  exigirPermissaoNaPagina(ctx.role, "prontuario.proprio");

  const dados = await exportarRegistroIndividual(ctx, pacienteId, registroId).catch((erro) => {
    if (erro instanceof ErroNegocio) notFound();
    throw erro;
  });

  const { paciente, registro, adendos, autor } = dados;
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10 print:max-w-none print:p-0 print:m-0 text-foreground">
      {/* Botão de Impressão (oculto no papel) */}
      <div className="flex items-center justify-between gap-3 border-b pb-4 print:hidden">
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Documento Clínico Individual</span>
          <h1 className="text-lg font-bold">Relatório / Parecer — {paciente.nome}</h1>
        </div>
        <BotaoImprimir />
      </div>

      {/* Cabeçalho Timbrado do Documento */}
      <header className="flex flex-col items-center text-center border-b-2 border-primary/20 pb-6 gap-1.5">
        <h2 className="text-xl font-bold tracking-tight uppercase text-foreground">{ctx.tenantNome}</h2>
        <p className="text-xs text-muted-foreground">Serviços Especializados de Saúde e Atendimento Clínico</p>
        <div className="mt-2 text-xs font-medium text-foreground/80">
          <span>{autor.nome}</span>
          {autor.especialidade && <span> · {autor.especialidade}</span>}
          {autor.conselho && autor.registro && (
            <span> · {autor.conselho} nº {autor.registro}</span>
          )}
        </div>
      </header>

      {/* Dados do Paciente */}
      <section className="rounded-lg border bg-muted/20 p-4 text-xs leading-relaxed">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="font-semibold text-muted-foreground">Paciente: </span>
            <span className="font-bold text-foreground text-sm">{paciente.nome}</span>
          </div>
          {paciente.dataNascimento && (
            <div>
              <span className="font-semibold text-muted-foreground">Data de Nascimento: </span>
              <span className="text-foreground">{formatarDataBr(paciente.dataNascimento)}</span>
            </div>
          )}
          <div>
            <span className="font-semibold text-muted-foreground">Profissional Emitente: </span>
            <span className="text-foreground">{autor.nome} {autor.conselho ? `(${autor.conselho} ${autor.registro ?? ""})` : ""}</span>
          </div>
          <div>
            <span className="font-semibold text-muted-foreground">Data da Sessão / Registro: </span>
            <span className="text-foreground">{horarioLocal(registro.finalizadoEm ?? registro.criadoEm)}</span>
          </div>
        </div>
      </section>

      {/* Conteúdo Principal do Relatório */}
      <article className="flex flex-col gap-6 text-sm leading-relaxed font-serif text-foreground/90 whitespace-pre-wrap px-2">
        {registro.conteudo.anotacoes ? (
          <div>{registro.conteudo.anotacoes}</div>
        ) : (
          <p className="italic text-muted-foreground">Nenhum texto descritivo.</p>
        )}

        {registro.conteudo.prescricao && (
          <div className="mt-4 border-t pt-4 font-sans text-xs">
            <h3 className="font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Orientações / Recomendações
            </h3>
            <p className="whitespace-pre-wrap">{registro.conteudo.prescricao}</p>
          </div>
        )}

        {adendos.length > 0 && (
          <div className="mt-6 border-l-2 border-primary/40 pl-4 text-xs font-sans">
            <h3 className="font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Adendos e Complementações Posteriores
            </h3>
            {adendos.map((a) => (
              <div key={a.id} className="mb-3">
                <p className="text-[11px] text-muted-foreground">Em {horarioLocal(a.finalizadoEm ?? a.criadoEm)}:</p>
                <p className="whitespace-pre-wrap">{a.conteudo.anotacoes}</p>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* Fechamento com Data e Linha de Carimbo / Assinatura */}
      <footer className="mt-12 flex flex-col items-center text-center gap-6 pt-6">
        <p className="text-xs text-muted-foreground">
          Emitido em {hoje}.
        </p>

        <div className="flex flex-col items-center gap-1 min-w-64 border-t border-foreground/40 pt-2">
          <span className="text-sm font-semibold">{autor.nome}</span>
          <span className="text-xs text-muted-foreground">
            {[autor.especialidade, autor.conselho && `${autor.conselho} ${autor.registro ?? ""}`.trim()]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
            Assinatura Digital Eletrônica · SHA-256: {registro.hash?.slice(0, 16)}...
          </span>
        </div>

        <div className="w-full border-t pt-3 text-[10px] text-muted-foreground flex flex-wrap justify-between">
          <span>{ctx.tenantNome} · Prontuário Eletrônico Salus</span>
          <span>Hash completo: {registro.hash}</span>
        </div>
      </footer>
    </main>
  );
}
