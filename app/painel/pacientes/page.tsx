import Link from "next/link";
import { Search, Users } from "lucide-react";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoVazio } from "@/components/estado-vazio";
import { iniciais } from "@/components/shell/iniciais";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { buscarPacientes } from "@/src/server/pacientes";
import { formatarDataBr } from "@/src/server/reservas";
import { formatarCpf } from "./campos-paciente";
import { NovoPaciente } from "./novo-paciente";

export default async function PacientesPage({ searchParams }: PageProps<"/painel/pacientes">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "pacientes.ver");
  const { busca: buscaBruta, inativos, pagina: paginaBruta, novo } = await searchParams;
  const busca = typeof buscaBruta === "string" ? buscaBruta : "";
  const incluirInativos = inativos === "1";
  const paginaPedida = typeof paginaBruta === "string" && /^\d{1,5}$/.test(paginaBruta) ? Number(paginaBruta) : 1;
  const { itens: pacientes, total, pagina, paginas } = await buscarPacientes(ctx, { busca, incluirInativos, pagina: paginaPedida });
  const hrefPagina = (n: number, inativosNoLink = incluirInativos) => {
    const q = new URLSearchParams();
    if (busca) q.set("busca", busca);
    if (inativosNoLink) q.set("inativos", "1");
    if (n > 1) q.set("pagina", String(n));
    const query = q.toString();
    return query ? `/painel/pacientes?${query}` : "/painel/pacientes";
  };
  const ehProfissional = !pode(ctx.role, "pacientes.gerenciar");

  const chip = (ativo: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${
      ativo ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <CabecalhoPagina
        titulo="Pacientes"
        descricao={
          ehProfissional
            ? "Pacientes que você cadastrou ou que têm atendimento com você."
            : "Cadastro único do espaço. Cada profissional vê apenas os próprios pacientes."
        }
        acoes={<NovoPaciente key={novo === "1" ? "novo" : "lista"} abertoInicial={novo === "1"} />}
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form className="flex w-full max-w-md items-center gap-2" action="/painel/pacientes">
              {incluirInativos && <input type="hidden" name="inativos" value="1" />}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input name="busca" defaultValue={busca} placeholder="Nome, CPF ou telefone" className="pl-8" aria-label="Buscar paciente" />
              </div>
              <Button type="submit" variant="outline">
                Buscar
              </Button>
            </form>
            <div className="flex items-center gap-2" role="group" aria-label="Filtro de situação">
              <Link href={hrefPagina(1, false)} className={chip(!incluirInativos)} aria-pressed={!incluirInativos}>
                Ativos
              </Link>
              <Link href={hrefPagina(1, true)} className={chip(incluirInativos)} aria-pressed={incluirInativos}>
                Incluir inativos
              </Link>
            </div>
          </div>

          {pacientes.length === 0 ? (
            <EstadoVazio
              icone={Users}
              titulo={busca ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
              descricao={busca ? `Nada para “${busca}”. Confira a grafia ou busque pelo telefone.` : "Cadastre o primeiro paciente pelo botão Novo paciente."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">CPF</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                  <TableHead className="hidden lg:table-cell">Nascimento</TableHead>
                  <TableHead className="text-right">Lembretes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pacientes.map((p) => (
                  <TableRow key={p.id} className={p.ativo ? undefined : "opacity-60"}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{iniciais(p.nome)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link href={`/painel/pacientes/${p.id}`} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                            {p.nome}
                          </Link>
                          {!p.ativo && (
                            <Badge variant="outline" className="ml-2">
                              inativo
                            </Badge>
                          )}
                          <span className="block text-xs text-muted-foreground sm:hidden">{p.telefone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{p.cpf ? formatarCpf(p.cpf) : "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{p.telefone ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{p.dataNascimento ? formatarDataBr(p.dataNascimento) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.consentimentoLembretes ? (
                        <Badge className="border-success/30 bg-success/10 text-success">Aceita</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </main>
  );
}
