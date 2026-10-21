import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { hojeNoEspaco } from "@/src/server/fuso";
import { profissionais, tenants, tenantSettings } from "@/src/db/schema";
import { withTenant } from "@/src/db/tenant";

import { listarContratos, obterContrato } from "@/src/server/contratos";
import { listarTodasSalasAtivas } from "@/src/server/unidades";
import { FormularioNovoContrato, type ContratoAtual } from "./formulario-novo-contrato";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovoContratoPage({ searchParams }: PageProps<"/painel/contratos/novo">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "contratos.gerenciar");
  const { profissional } = await searchParams;
  const selecionado = typeof profissional === "string" && UUID.test(profissional) ? profissional : null;

  const { espaco, lista, prazoPadrao } = await withTenant(ctx, async (tx) => {
    const [t] = await tx.select({ nome: tenants.nome, documento: tenants.documento }).from(tenants);
    const [cfg] = await tx.select({ horas: tenantSettings.antecedenciaCancelamentoHoras }).from(tenantSettings);
    const l = await tx
      .select({ id: profissionais.id, nome: profissionais.nome, conselho: profissionais.conselho, registro: profissionais.registro })
      .from(profissionais)
      .where(eq(profissionais.ativo, true))
      .orderBy(asc(profissionais.nome));
    return { espaco: t, lista: l, prazoPadrao: Math.min(cfg?.horas ?? 24, 720) };
  });
  const salas = await listarTodasSalasAtivas(ctx);

  // Reajuste: parte do contrato aberto (vigente ou futuro) do profissional escolhido.
  let atual: ContratoAtual | null = null;
  if (selecionado) {
    const aberto = (await listarContratos(ctx, { profissionalId: selecionado })).find((c) => c.situacao !== "encerrado");
    if (aberto) {
      const d = await obterContrato(ctx, aberto.id);
      atual = { codigo: d.contrato.codigo, valores: d.contrato, grade: d.grade };
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/painel/contratos" className="text-sm text-muted-foreground hover:underline">
          ← Contratos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{atual ? `Reajuste do contrato ${atual.codigo}` : "Novo contrato"}</h1>
        <p className="text-sm text-muted-foreground">
          {atual
            ? "A versão atual termina na véspera da nova data de início; os meses anteriores continuam com os valores antigos."
            : "Defina como o profissional paga pelo uso das salas e, se houver, a grade fixa semanal."}
        </p>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre um profissional antes.{" "}
          <Link href="/painel/profissionais" className="text-primary underline-offset-4 hover:underline">
            Profissionais
          </Link>
        </p>
      ) : (
        <FormularioNovoContrato
          profissionais={lista}
          salas={salas.map((s) => ({ id: s.id, nome: `${s.unidadeNome} · ${s.nome}` }))}
          profissionalInicial={selecionado ?? lista[0].id}
          atual={atual}
          prazoPadrao={prazoPadrao}
          hoje={await hojeNoEspaco(ctx)}
          espaco={{ nome: espaco?.nome ?? ctx.tenantNome, documento: espaco?.documento ?? null }}
        />
      )}
    </main>
  );
}
