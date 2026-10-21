import { eq } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "../db/audit";
import type { Database } from "../db/client";
import { agendamentos, pacientes, profissionais, reservasSala, salas, tenants, unidades } from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import { valorPorExtenso } from "../domain/dinheiro";
import { acordoVigente } from "../domain/financeiro";
import { exigirPermissao, pode } from "../domain/rbac";
import { partesLocais } from "../domain/tempo";
import { ErroNegocio } from "./erros";
import { carregarAcordos } from "./financeiro";
import { profissionalDoUsuario } from "./profissionais";

// Recibo simples do atendimento para o paciente (ou o responsável): emitido pelo profissional,
// com o valor registrado no atendimento. Impresso/salvo em PDF pelo navegador.

export type DadosRecibo = {
  numero: string;
  valorCentavos: number;
  valorPorExtenso: string;
  /** Quem pagou: o responsável legal, quando houver, senão o paciente. */
  pagador: { nome: string; cpf: string | null; parentesco: string | null };
  paciente: { nome: string; cpf: string | null };
  profissional: { nome: string; conselho: string | null; registro: string | null; especialidade: string | null; documento: string | null };
  /** Pagamento centralizado: o espaço recebeu em nome do profissional. */
  recebidoPeloEspaco: boolean;
  espaco: { nome: string; documento: string };
  local: { unidade: string; endereco: string | null };
  data: string;
  hora: string;
};

export async function dadosDoRecibo(ctx: ContextoTenant, agendamentoId: string, database?: Database): Promise<DadosRecibo> {
  const id = z.uuid().parse(agendamentoId);
  return withTenant(
    ctx,
    async (tx) => {
      const [linha] = await tx
        .select({ agendamento: agendamentos, paciente: pacientes, profissional: profissionais, unidade: unidades })
        .from(agendamentos)
        .innerJoin(pacientes, eq(pacientes.id, agendamentos.pacienteId))
        .innerJoin(profissionais, eq(profissionais.id, agendamentos.profissionalId))
        .innerJoin(reservasSala, eq(reservasSala.id, agendamentos.reservaId))
        .innerJoin(salas, eq(salas.id, reservasSala.salaId))
        .innerJoin(unidades, eq(unidades.id, salas.unidadeId))
        .where(eq(agendamentos.id, id));
      if (!linha) throw new ErroNegocio("Atendimento não encontrado");
      if (!pode(ctx.role, "agenda.gerenciar")) {
        exigirPermissao(ctx.role, "agenda.propria");
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== linha.agendamento.profissionalId) throw new ErroNegocio("Atendimento não encontrado");
      }
      const { agendamento: a, paciente: p, profissional: pr, unidade: u } = linha;
      if (a.status !== "realizado" || !a.valorCentavos) {
        throw new ErroNegocio("O recibo é emitido para atendimento realizado com o valor registrado");
      }
      const inicio = partesLocais(a.periodo.inicio, u.timezone);
      const acordo = acordoVigente(await carregarAcordos(tx, pr.id), inicio.data);
      const [espaco] = await tx.select({ nome: tenants.nome, documento: tenants.documento }).from(tenants);
      await registrarAuditoria(tx, { acao: "recibo.emitido", entidade: "agendamentos", entidadeId: a.id });
      return {
        numero: `${inicio.data.slice(0, 4)}-${a.id.slice(0, 8).toUpperCase()}`,
        valorCentavos: a.valorCentavos,
        valorPorExtenso: valorPorExtenso(a.valorCentavos),
        pagador: p.responsavelNome
          ? { nome: p.responsavelNome, cpf: p.responsavelCpf, parentesco: p.responsavelParentesco }
          : { nome: p.nome, cpf: p.cpf, parentesco: null },
        paciente: { nome: p.nome, cpf: p.cpf },
        profissional: { nome: pr.nome, conselho: pr.conselho, registro: pr.registro, especialidade: pr.especialidade, documento: pr.documento },
        recebidoPeloEspaco: acordo?.fluxoRecebimento === "centralizado",
        espaco,
        local: { unidade: u.nome, endereco: u.endereco },
        data: inicio.data,
        hora: inicio.hora,
      };
    },
    database,
  );
}
