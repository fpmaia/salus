import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database } from "../db/client";
import { agendamentos, notificacoesOutbox, pacientes, profissionais, reservasSala, salas, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";
import { acessosAoProntuario } from "./prontuario";
import { ErroNegocio } from "./erros";

// Direitos do titular (LGPD art. 18) sobre o cadastro do paciente, exercidos pelo espaço
// (controlador) por meio do admin. O conteúdo do prontuário fica fora: é sigiloso, exportado pelo
// profissional responsável e tem guarda legal de 20 anos.

const ATIVOS = ["agendado", "confirmado", "presente"] as const;

/** Acesso e portabilidade: tudo o que o espaço guarda do paciente, menos o conteúdo clínico. */
export async function exportarDadosPaciente(ctx: ContextoTenant, pacienteId: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "pacientes.titular");
  const id = z.uuid().parse(pacienteId);
  const dados = await withTenant(
    ctx,
    async (tx) => {
      const [paciente] = await tx.select().from(pacientes).where(eq(pacientes.id, id));
      if (!paciente) throw new ErroNegocio("Paciente não encontrado");
      const [espaco] = await tx.select({ nome: tenants.nome, documento: tenants.documento }).from(tenants);
      const atendimentos = await tx
        .select({
          id: agendamentos.id,
          periodo: agendamentos.periodo,
          status: agendamentos.status,
          origem: agendamentos.origem,
          cancelamentoTardio: agendamentos.cancelamentoTardio,
          profissional: profissionais.nome,
          sala: salas.nome,
          unidade: unidades.nome,
        })
        .from(agendamentos)
        .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
        .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(eq(agendamentos.pacienteId, id))
        .orderBy(asc(agendamentos.periodo));
      const idsAtendimentos = atendimentos.map((a) => a.id);
      const mensagens = idsAtendimentos.length
        ? await tx
            .select({ canal: notificacoesOutbox.canal, tipo: notificacoesOutbox.tipo, status: notificacoesOutbox.status, enviadoEm: notificacoesOutbox.enviadoEm, destinatario: notificacoesOutbox.destinatario })
            .from(notificacoesOutbox)
            .where(inArray(notificacoesOutbox.agendamentoId, idsAtendimentos))
            .orderBy(asc(notificacoesOutbox.criadoEm))
        : [];
      await registrarAuditoria(tx, { acao: "paciente.dados_exportados", entidade: "pacientes", entidadeId: id });
      return { paciente, espaco, atendimentos, mensagens };
    },
    database,
  );
  const acessos = await acessosAoProntuario(ctx, id, database);
  const { paciente, espaco, atendimentos, mensagens } = dados;
  return {
    geradoEm: agora.toISOString(),
    controlador: { nome: espaco?.nome ?? null, documento: espaco?.documento ?? null },
    observacao:
      "Dados administrativos do paciente neste espaço. O conteúdo do prontuário é sigiloso e é fornecido pelo profissional responsável.",
    paciente: {
      nome: paciente.nome,
      cpf: paciente.cpf,
      dataNascimento: paciente.dataNascimento,
      telefone: paciente.telefone,
      email: paciente.email,
      responsavel: paciente.responsavelNome
        ? { nome: paciente.responsavelNome, cpf: paciente.responsavelCpf, parentesco: paciente.responsavelParentesco }
        : null,
      convenio: paciente.convenioNome ? { nome: paciente.convenioNome, carteirinha: paciente.convenioCarteirinha } : null,
      endereco: paciente.endereco || paciente.cep
        ? { endereco: paciente.endereco, bairro: paciente.bairro, cidade: paciente.cidade, uf: paciente.uf, cep: paciente.cep }
        : null,
      consentimentoLembretes: paciente.consentimentoLembretes,
      consentimentoEm: paciente.consentimentoEm?.toISOString() ?? null,
      ativo: paciente.ativo,
      anonimizadoEm: paciente.anonimizadoEm?.toISOString() ?? null,
      criadoEm: paciente.criadoEm.toISOString(),
    },
    atendimentos: atendimentos.map((a) => ({
      inicio: a.periodo.inicio.toISOString(),
      fim: a.periodo.fim.toISOString(),
      status: a.status,
      origem: a.origem,
      cancelamentoTardio: a.cancelamentoTardio,
      profissional: a.profissional,
      local: `${a.unidade} · ${a.sala}`,
    })),
    mensagensEnviadas: mensagens.map((m) => ({ ...m, enviadoEm: m.enviadoEm?.toISOString() ?? null })),
    acessosAoProntuario: acessos.map((a) => ({ acao: a.acao, por: a.usuarioNome, em: a.criadoEm.toISOString() })),
  };
}

export const anonimizacaoSchema = z.object({
  justificativa: z.string().trim().min(10, "Descreva o pedido (ao menos 10 caracteres)").max(500),
});

/**
 * Anonimização a pedido do titular: apaga nome, documentos e contatos do cadastro, das
 * observações dos atendimentos e das mensagens. Irreversível. Mantém o histórico de atendimentos e
 * o financeiro (sem identificação). Recusada se houver prontuário (guarda legal) ou consultas futuras.
 */
export async function anonimizarPaciente(
  ctx: ContextoTenant,
  pacienteId: string,
  dados: z.input<typeof anonimizacaoSchema>,
  agora = new Date(),
  database?: Database,
) {
  exigirPermissao(ctx.role, "pacientes.titular");
  const id = z.uuid().parse(pacienteId);
  const { justificativa } = anonimizacaoSchema.parse(dados);
  return withTenant(
    ctx,
    async (tx) => {
      const [paciente] = await tx.select().from(pacientes).where(eq(pacientes.id, id)).for("update");
      if (!paciente) throw new ErroNegocio("Paciente não encontrado");
      if (paciente.anonimizadoEm) throw new ErroNegocio("Este paciente já foi anonimizado");

      const [{ temProntuario }] = await tx.execute<{ temProntuario: boolean }>(
        sql`select app_paciente_tem_prontuario(${id}) as "temProntuario"`,
      ).then((r) => r.rows);
      if (temProntuario) {
        throw new ErroNegocio(
          "Este paciente tem prontuário, que precisa ser guardado por 20 anos (CFM / Lei 13.787/2018). O cadastro não pode ser anonimizado; registre o pedido e responda ao titular com essa justificativa legal.",
        );
      }
      const futuros = await tx
        .select({ id: agendamentos.id })
        .from(agendamentos)
        .where(
          and(
            eq(agendamentos.pacienteId, id),
            inArray(agendamentos.status, [...ATIVOS]),
            sql`upper(${agendamentos.periodo}) > ${agora.toISOString()}::timestamptz`,
          ),
        )
        .limit(1);
      if (futuros.length) throw new ErroNegocio("Cancele os atendimentos futuros do paciente antes de anonimizar");

      const atendimentos = await tx
        .update(agendamentos)
        .set({ observacao: null })
        .where(eq(agendamentos.pacienteId, id))
        .returning({ id: agendamentos.id });
      if (atendimentos.length) {
        await tx
          .update(notificacoesOutbox)
          .set({ destinatario: "anonimizado", parametros: {} })
          .where(inArray(notificacoesOutbox.agendamentoId, atendimentos.map((a) => a.id)));
      }
      await tx
        .update(pacientes)
        .set({
          nome: `Paciente anonimizado ${id.slice(0, 8)}`,
          cpf: null,
          dataNascimento: null,
          telefone: null,
          email: null,
          responsavelNome: null,
          responsavelCpf: null,
          responsavelParentesco: null,
          convenioNome: null,
          convenioCarteirinha: null,
          cep: null,
          endereco: null,
          bairro: null,
          cidade: null,
          uf: null,
          consentimentoLembretes: false,
          consentimentoEm: null,
          ativo: false,
          anonimizadoEm: agora,
        })
        .where(eq(pacientes.id, id));
      // Sem dado pessoal na auditoria: só o motivo e o volume afetado.
      await registrarAuditoria(tx, {
        acao: "paciente.anonimizado",
        entidade: "pacientes",
        entidadeId: id,
        dados: { justificativa, atendimentos: atendimentos.length },
      });
      return { atendimentos: atendimentos.length };
    },
    database,
  );
}
