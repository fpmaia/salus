import { exigirModuloNaPagina } from "@/src/auth/permissao";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { listarPacientes } from "@/src/server/pacientes";
import { profissionaisDesligados } from "@/src/server/prontuario";
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
    const pacientes = await listarPacientes(ctx, { busca: termo });
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Prontuário</CardTitle>
            <CardDescription>
              Só você lê o que escreve, salvo compartilhamento com consentimento do paciente. Cada acesso fica registrado.
            </CardDescription>
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
