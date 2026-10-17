import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { ROTULOS_STATUS } from "@/src/domain/agendamentos";
import { pode } from "@/src/domain/rbac";
import { obterPaciente } from "@/src/server/pacientes";
import { acessosAoProntuario, horarioLocal, ROTULOS_ACESSO } from "@/src/server/prontuario";
import { formatarDataBr } from "@/src/server/reservas";
import { atualizarPacienteAcao } from "../actions";
import { CamposPaciente } from "../campos-paciente";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PacientePage({ params }: PageProps<"/painel/pacientes/[id]">) {
  const { id } = await params;
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "pacientes.ver");
  if (!UUID.test(id)) notFound();
  const detalhe = await obterPaciente(ctx, id);
  if (!detalhe) notFound();
  const { paciente, historico } = detalhe;
  const acessos = pode(ctx.role, "auditoria.ver") ? await acessosAoProntuario(ctx, paciente.id) : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/painel/pacientes" className="text-sm text-muted-foreground hover:underline">
          ← Pacientes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{paciente.nome}</h1>
        {paciente.consentimentoLembretes && paciente.consentimentoEm && (
          <p className="text-xs text-muted-foreground">
            Consentiu com lembretes em {paciente.consentimentoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAcao acao={atualizarPacienteAcao.bind(null, paciente.id)} textoBotao="Salvar">
            <CamposPaciente valores={paciente} prefixo={paciente.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={paciente.ativo} /> Ativo
            </label>
          </FormAcao>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atendimentos</CardTitle>
          <CardDescription>Histórico de agendamentos (sem informação clínica).</CardDescription>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendimento.</p>
          ) : (
            <ul className="divide-y">
              {historico.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {formatarDataBr(h.data)} · {h.horaInicio}–{h.horaFim}
                    <span className="block text-xs text-muted-foreground">
                      {h.profissionalNome} · {h.salaNome}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ROTULOS_STATUS[h.status]}
                    {h.cancelamentoTardio && " (tardio)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {acessos && (
        <Card>
          <CardHeader>
            <CardTitle>Acessos ao prontuário</CardTitle>
            <CardDescription>
              Quem leu, exportou ou baixou anexos do prontuário deste paciente (últimos 200). Atende ao pedido de informação do
              titular (LGPD); não mostra conteúdo clínico.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {acessos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acesso registrado.</p>
            ) : (
              <ul className="divide-y">
                {acessos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {ROTULOS_ACESSO[a.acao] ?? a.acao}
                      <span className="block text-xs text-muted-foreground">{a.usuarioNome ?? "Usuário removido"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{horarioLocal(a.criadoEm)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
