import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Sparkles,
  Stethoscope,
  ShieldCheck,
  Clock,
  Lock,
  FileCheck2,
  FileText,
} from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirModuloNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { obterStatusLicencaProntuarioProfissional } from "@/src/server/assinatura";
import { listarPacientes } from "@/src/server/pacientes";
import { profissionaisDesligados } from "@/src/server/prontuario";
import { formatarDataBr } from "@/src/server/reservas";
import { AcoesLicencaProntuario } from "@/components/acoes-licenca-prontuario";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { solicitarProntuarioAcao } from "./actions";

export default async function ProntuarioPage({ searchParams }: PageProps<"/painel/prontuario">) {
  const ctx = await obterContextoTenant();
  await exigirModuloNaPagina(ctx, "prontuario");
  const profissional = pode(ctx.role, "prontuario.proprio");
  const solicitante = pode(ctx.role, "prontuario.solicitacao");
  if (!profissional && !solicitante) notFound();
  const { busca } = await searchParams;
  const termo = typeof busca === "string" ? busca : "";

  if (profissional) {
    const statusLicenca = await obterStatusLicencaProntuarioProfissional(ctx);

    // Sem licença (nunca ativou ou o admin desligou): apresentação e ativação.
    if (statusLicenca.possuiPerfilProfissional && statusLicenca.estado === "inativa") {
      return (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
          <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-b from-primary/10 via-primary/5 to-background p-8 shadow-xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <Stethoscope className="size-8" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                    Prontuário Eletrônico do Salus
                  </h1>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="size-3" /> 15 Dias Grátis
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Registre a evolução dos seus pacientes num ambiente cifrado, com registros imutáveis depois de finalizados e cada acesso auditado.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Lock className="size-4 text-primary" /> Sigilo Absoluto
                </span>
                <p className="text-xs text-muted-foreground">
                  Apenas você tem a chave de acesso. Recepção e administradores não conseguem ler seu prontuário.
                </p>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <FileCheck2 className="size-4 text-primary" /> Conformidade CFM
                </span>
                <p className="text-xs text-muted-foreground">
                  Registros imutáveis com adendos auditados e rastreabilidade total conforme a Resolução CFM.
                </p>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-1.5 shadow-xs">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <FileText className="size-4 text-primary" /> Prescrições & Anexos
                </span>
                <p className="text-xs text-muted-foreground">
                  Emissão de receitas, pedidos de exames e anexos de laudos guardados cifrados.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
              <div className="text-xs text-muted-foreground space-y-0.5 max-w-md">
                <p className="font-semibold text-foreground">
                  {statusLicenca.jaTeveTeste ? "Seu período de teste de 15 dias já foi usado." : "15 dias de teste grátis, sem compromisso."}
                </p>
                <p>
                  Depois do teste, a licença individual custa <strong>{formatarMoeda(statusLicenca.valorCentavos)} a cada 30 dias</strong>, paga
                  por você, ou entra na fatura do espaço se o administrador ativar por lá.
                </p>
              </div>
              <AcoesLicencaProntuario status={statusLicenca} />
            </div>
          </div>
        </main>
      );
    }

    const pacientes = await listarPacientes(ctx, { busca: termo });

    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        {statusLicenca.possuiPerfilProfissional && statusLicenca.estado === "aguardando_pagamento" && (
          <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong>Pagamento do prontuário vencido.</strong> Você continua lendo os registros, mas novas evoluções, adendos e anexos ficam
              bloqueados até o pagamento.
            </span>
            <AcoesLicencaProntuario status={statusLicenca} />
          </div>
        )}

        {/* Banner de Trial Ativo */}
        {statusLicenca.possuiPerfilProfissional && statusLicenca.emTrial && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Degustação Gratuita:</strong> Você tem{" "}
                <span className="underline decoration-emerald-500 underline-offset-2 font-bold">
                  {statusLicenca.diasRestantes} {statusLicenca.diasRestantes === 1 ? "dia restante" : "dias restantes"}
                </span>{" "}
                de teste grátis do Prontuário Eletrônico
                {statusLicenca.trialFimEm ? ` (até ${formatarDataBr(statusLicenca.trialFimEm.toISOString().slice(0, 10))})` : ""}.
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold">
              <Clock className="size-3" /> Teste Grátis
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Prontuário</CardTitle>
                <CardDescription>
                  Só você lê o que escreve, salvo compartilhamento com consentimento do paciente. Cada acesso fica registrado.
                </CardDescription>
              </div>
              {statusLicenca.possuiPerfilProfissional && statusLicenca.estado === "ativa" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  <ShieldCheck className="size-3" /> Licença Ativa
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form className="flex gap-2" action="/painel/prontuario">
              <Input name="busca" defaultValue={termo} placeholder="Buscar paciente" className="max-w-xs" aria-label="Buscar paciente" />
              <Button type="submit" variant="outline">
                Buscar
              </Button>
            </form>
            {pacientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum paciente.</p>
            ) : (
              <ul className="divide-y text-sm">
                {pacientes.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link href={`/painel/prontuario/${p.id}`} className="text-primary underline-offset-4 hover:underline">
                      {p.nome}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  // Admin: só a solicitação formal (prontuário de profissional desligado).
  const [desligados, pacientes] = await Promise.all([profissionaisDesligados(ctx), listarPacientes(ctx, { incluirInativos: true })]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="size-5 text-primary" />
              Módulo de Prontuário Eletrônico (EHR)
            </CardTitle>
            <CardDescription className="text-xs">
              Ambiente clínico com sigilo profissional (apenas o profissional tem acesso às anotações dos seus pacientes).
            </CardDescription>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary self-start sm:self-auto">
            <Sparkles className="size-3.5" /> R$ 49,90 / mês por profissional
          </span>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <p>
            O Prontuário Eletrônico é um <strong>módulo adicional cobrado por profissional que o utiliza</strong>. Cada profissional ganha <strong>15 dias de degustação gratuita</strong> ao fazer o primeiro acesso.
          </p>
          <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
            <span>Você pode ativar ou desativar o acesso dos profissionais a qualquer momento.</span>
            <Button asChild size="sm" variant="default">
              <Link href="/painel/assinatura">Gerenciar licenças na Assinatura →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Solicitação de prontuário</CardTitle>
          <CardDescription>
            A administração do espaço não tem acesso ao conteúdo clínico. Esta solicitação é só para prontuários de profissional
            desligado (ex.: pedido de cópia pelo paciente ou por ordem judicial). Ela fica registrada com a sua justificativa e
            libera a visualização por 1 hora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {desligados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum profissional desligado.</p>
          ) : (
            <FormAcao acao={solicitarProntuarioAcao} textoBotao="Registrar solicitação e abrir" textoPendente="Registrando…">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sol-prof">Profissional desligado</Label>
                  <NativeSelect id="sol-prof" name="profissionalId" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {desligados.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sol-pac">Paciente</Label>
                  <NativeSelect id="sol-pac" name="pacienteId" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {pacientes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="sol-just">Justificativa</Label>
                  <Input id="sol-just" name="justificativa" minLength={20} maxLength={500} required placeholder="Ex.: paciente solicitou cópia integral, protocolo nº…" />
                </div>
              </div>
            </FormAcao>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
