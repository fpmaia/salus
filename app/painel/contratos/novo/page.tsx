import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSignature } from "lucide-react";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { withTenant } from "@/src/db/tenant";
import { salas, profissionais, tenants } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { FormularioNovoContrato } from "./formulario-novo-contrato";

export default async function NovoContratoPage() {
  const ctx = await obterContextoTenant();

  if (!pode(ctx.role, "contratos.gerenciar")) {
    redirect("/painel/contratos");
  }

  const { clinica, salasAtivas, profissionaisAtivos } = await withTenant(
    ctx,
    async (tx) => {
      const [t] = await tx
        .select({ nome: tenants.nome, documento: tenants.documento })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId));

      const s = await tx
        .select({
          id: salas.id,
          nome: salas.nome,
          valorMensalCentavos: salas.valorMensalCentavos,
        })
        .from(salas)
        .where(eq(salas.ativo, true));

      const p = await tx
        .select({
          id: profissionais.id,
          nome: profissionais.nome,
          conselho: profissionais.conselho,
          registro: profissionais.registro,
          especialidade: profissionais.especialidade,
        })
        .from(profissionais)
        .where(eq(profissionais.ativo, true));

      return {
        clinica: {
          nome: t?.nome ?? ctx.tenantNome,
          documento: t?.documento ?? null,
        },
        salasAtivas: s,
        profissionaisAtivos: p,
      };
    }
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/painel/contratos"
          className="flex size-8 items-center justify-center rounded-xl border border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Voltar para Contratos"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileSignature className="size-6 text-primary" />
            Novo Contrato de Aluguel Fixo
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cadastre o contrato, estipule a grade semanal e preencha a agenda automaticamente
          </p>
        </div>
      </div>

      {salasAtivas.length === 0 || profissionaisAtivos.length === 0 ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-xs space-y-3">
          <p className="font-semibold text-destructive">
            É necessário ter pelo menos uma sala ativa e um profissional ativo cadastrados no sistema.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/painel/unidades"
              className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground font-semibold"
            >
              Cadastrar Salas
            </Link>
            <Link
              href="/painel/profissionais"
              className="rounded-lg border border-border px-3 py-1.5 font-semibold"
            >
              Cadastrar Profissionais
            </Link>
          </div>
        </div>
      ) : (
        <FormularioNovoContrato
          clinicaNome={clinica.nome}
          clinicaDocumento={clinica.documento}
          salas={salasAtivas}
          profissionais={profissionaisAtivos}
        />
      )}
    </main>
  );
}
