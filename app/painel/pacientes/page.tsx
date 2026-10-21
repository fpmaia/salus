import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { buscarPacientes } from "@/src/server/pacientes";
import { formatarDataBr } from "@/src/server/reservas";
import { criarPacienteAcao } from "./actions";
import { CamposPaciente, formatarCpf } from "./campos-paciente";

export default async function PacientesPage({ searchParams }: PageProps<"/painel/pacientes">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "pacientes.ver");
  const { busca: buscaBruta, inativos, pagina: paginaBruta } = await searchParams;
  const busca = typeof buscaBruta === "string" ? buscaBruta : "";
  const incluirInativos = inativos === "1";
  const paginaPedida = typeof paginaBruta === "string" && /^\d{1,5}$/.test(paginaBruta) ? Number(paginaBruta) : 1;
  const { itens: pacientes, total, pagina, paginas } = await buscarPacientes(ctx, { busca, incluirInativos, pagina: paginaPedida });
  const hrefPagina = (n: number) => {
    const q = new URLSearchParams();
    if (busca) q.set("busca", busca);
    if (incluirInativos) q.set("inativos", "1");
    if (n > 1) q.set("pagina", String(n));
    const query = q.toString();
    return query ? `/painel/pacientes?${query}` : "/painel/pacientes";
  };
  const ehProfissional = !pode(ctx.role, "pacientes.gerenciar");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Pacientes</CardTitle>
          <CardDescription>
            {ehProfissional
              ? "Pacientes que você cadastrou ou que têm atendimento com você."
              : "Cadastro único do espaço. Cada profissional vê apenas os próprios pacientes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-center gap-2" action="/painel/pacientes">
            <Input name="busca" defaultValue={busca} placeholder="Nome, CPF ou telefone" className="max-w-xs" aria-label="Buscar paciente" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="inativos" value="1" defaultChecked={incluirInativos} /> Incluir inativos
            </label>
            <Button type="submit" variant="outline">
              Buscar
            </Button>
          </form>
          {pacientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
          ) : (
            <ul className="divide-y">
              {pacientes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <Link href={`/painel/pacientes/${p.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {p.nome}
                    </Link>
                    {!p.ativo && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                    <span className="block text-xs text-muted-foreground">
                      {[p.cpf && formatarCpf(p.cpf), p.telefone, p.dataNascimento && `nasc. ${formatarDataBr(p.dataNascimento)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{p.consentimentoLembretes ? "Aceita lembretes" : "Sem lembretes"}</span>
                </li>
              ))}
            </ul>
          )}
          {total > 0 && (
            <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {total} paciente{total === 1 ? "" : "s"}
                {paginas > 1 && ` · página ${pagina} de ${paginas}`}
              </span>
              {paginas > 1 && (
                <span className="flex gap-2">
                  {pagina > 1 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={hrefPagina(pagina - 1)}>← Anterior</Link>
                    </Button>
                  )}
                  {pagina < paginas && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={hrefPagina(pagina + 1)}>Próxima →</Link>
                    </Button>
                  )}
                </span>
              )}
            </nav>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo paciente</CardTitle>
          <CardDescription>Peça apenas os dados necessários. O CPF é opcional.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormAcao acao={criarPacienteAcao} textoBotao="Cadastrar paciente">
            <CamposPaciente prefixo="novo" />
          </FormAcao>
        </CardContent>
      </Card>
    </main>
  );
}
