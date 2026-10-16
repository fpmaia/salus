import Link from "next/link";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode, ROTULOS_ROLE, type Permissao } from "@/src/domain/rbac";
import { BotaoSair } from "./botao-sair";

const NAVEGACAO: { href: string; rotulo: string; permissao?: Permissao }[] = [
  { href: "/painel", rotulo: "Início" },
  { href: "/painel/agenda", rotulo: "Agenda", permissao: "agenda.ver" },
  { href: "/painel/unidades", rotulo: "Unidades e salas", permissao: "salas.gerenciar" },
  { href: "/painel/profissionais", rotulo: "Profissionais", permissao: "profissionais.gerenciar" },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const ctx = await obterContextoTenant();
  const itens = NAVEGACAO.filter((item) => !item.permissao || pode(ctx.role, item.permissao));

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
              S
            </span>
            <div>
              <p className="font-medium leading-tight">{ctx.tenantNome}</p>
              <p className="text-xs text-muted-foreground">
                {ctx.usuario.nome} · {ROTULOS_ROLE[ctx.role]}
              </p>
            </div>
          </div>
          <BotaoSair />
        </div>
        <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-t-md px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
