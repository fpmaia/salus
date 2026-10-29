import Link from "next/link";
import { Gift } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarConvitesClinica, VALIDADE_PADRAO_CONVITE_CLINICA_DIAS, type SituacaoConviteClinica } from "@/src/server/convites-clinica";
import { listarPlanosDisponiveis } from "@/src/server/plataforma";
import { formatarDataBr } from "@/src/server/reservas";
import { revogarConviteClinicaAcao } from "./actions";
import { FormularioConviteClinica } from "./formulario-convite";
import { acessoPlataforma } from "../acesso";

const ROTULO: Record<SituacaoConviteClinica, { texto: string; classe: string }> = {
  pendente: { texto: "Aguardando cadastro", classe: "bg-primary/10 text-primary" },
  usado: { texto: "Clínica cadastrada", classe: "bg-success/15 text-success" },
  expirado: { texto: "Link vencido", classe: "bg-muted text-muted-foreground" },
  revogado: { texto: "Revogado", classe: "bg-muted text-muted-foreground" },
};

function data(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function ConvitesPlataformaPage() {
  const { usuario, pode } = await acessoPlataforma();
  const podeConvidar = pode("convites.gerenciar");
  const [planos, convites] = await Promise.all([listarPlanosDisponiveis(usuario.id), listarConvitesClinica(usuario.id)]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Gift className="size-6 text-primary" /> Convites de teste grátis
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Libere para uma clínica nova um período de teste num plano. Ela cria a conta com o e-mail convidado e cadastra o espaço pelo
          link. Durante o teste não há fatura, e o mês em que ele termina também não é cobrado.
        </p>
      </div>

      {podeConvidar && <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo convite</CardTitle>
          <CardDescription>Um convite novo para o mesmo e-mail substitui o anterior ainda não usado.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioConviteClinica
            planos={planos.map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo }))}
            validadePadrao={VALIDADE_PADRAO_CONVITE_CLINICA_DIAS}
          />
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convites enviados ({convites.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {convites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum convite ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {convites.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.email}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ROTULO[c.situacao].classe}`}>{ROTULO[c.situacao].texto}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.planoNome} · {c.diasTeste} dias · criado em {data(c.criadoEm)}
                      {c.criadoPorNome ? ` por ${c.criadoPorNome}` : ""}
                      {c.situacao === "pendente" ? ` · link vale até ${data(c.expiraEm)}` : ""}
                      {c.observacao ? ` · ${c.observacao}` : ""}
                    </span>
                    {c.tenantId && (
                      <span className="text-xs">
                        <Link href={`/plataforma/clinicas/${c.tenantId}`} className="font-semibold text-primary hover:underline">
                          {c.tenantNome}
                        </Link>
                        {c.testeAte ? ` · teste até ${formatarDataBr(c.testeAte)}` : " · teste encerrado"}
                      </span>
                    )}
                  </div>
                  {podeConvidar && c.situacao === "pendente" && (
                    <FormAcao
                      acao={revogarConviteClinicaAcao.bind(null, c.id)}
                      textoBotao="Revogar"
                      textoPendente="…"
                      variante="outline"
                      confirmar={`Revogar o convite de ${c.email}? O link deixa de funcionar.`}
                      className="flex items-center gap-2"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
