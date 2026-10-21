import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { acordosFinanceiros, agendamentos, convitesProfissional, pacientes, profissionais, salas, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";

// Primeiros passos do espaço (no lugar do tour e do manual): cada etapa com o link da tela
// onde ela se resolve. Some do início quando tudo estiver feito.

export type Etapa = { chave: string; titulo: string; descricao: string; href: string; feita: boolean };

export async function primeirosPassos(ctx: ContextoTenant, database?: Database): Promise<Etapa[]> {
  exigirPermissao(ctx.role, "tenant.configurar");
  return withTenant(
    ctx,
    async (tx) => {
      const existe = async (consulta: SQL) => (await tx.execute<{ ok: boolean }>(sql`select exists (${consulta}) as ok`)).rows[0]?.ok === true;
      // Uma consulta por vez: a transação usa uma única conexão.
      const unidade = await existe(sql`select 1 from ${unidades}`);
      const sala = await existe(sql`select 1 from ${salas}`);
      const profissional = await existe(sql`select 1 from ${profissionais}`);
      const contrato = await existe(sql`select 1 from ${acordosFinanceiros}`);
      const acesso = await existe(
        sql`select 1 from ${profissionais} where ${profissionais.membershipId} is not null union all select 1 from ${convitesProfissional}`,
      );
      const paciente = await existe(sql`select 1 from ${pacientes}`);
      const consulta = await existe(sql`select 1 from ${agendamentos}`);
      return [
        { chave: "unidade", titulo: "Cadastre a unidade", descricao: "Endereço e horário de funcionamento.", href: "/painel/unidades", feita: unidade },
        { chave: "salas", titulo: "Adicione as salas", descricao: "As salas que os profissionais alugam.", href: "/painel/unidades", feita: sala },
        { chave: "profissional", titulo: "Cadastre um profissional", descricao: "Nome, e-mail e registro no conselho.", href: "/painel/profissionais", feita: profissional },
        { chave: "contrato", titulo: "Faça o contrato do profissional", descricao: "Quanto ele paga pela sala e as regras de cancelamento.", href: "/painel/contratos/novo", feita: contrato },
        { chave: "convite", titulo: "Convide o profissional", descricao: "Ele recebe o acesso por e-mail e vê a própria agenda.", href: "/painel/profissionais", feita: acesso },
        { chave: "paciente", titulo: "Cadastre o primeiro paciente", descricao: "Nome e WhatsApp bastam.", href: "/painel/pacientes", feita: paciente },
        { chave: "consulta", titulo: "Agende a primeira consulta", descricao: "Clique num horário livre da agenda.", href: "/painel/agenda", feita: consulta },
      ];
    },
    database,
  );
}
