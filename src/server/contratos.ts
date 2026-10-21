import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { registrarAuditoria } from "../db/audit";
import type { Database } from "../db/client";
import {
  acordosFinanceiros,
  contratosLocacao,
  profissionais,
  regrasRecorrencia,
  reservasSala,
  salas,
  tenants,
  unidades,
  users,
} from "../db/schema";
import { type ContextoTenant, withTenant } from "../db/tenant";
import {
  contratoInputSchema,
  gerarMinutaContratoPadrao,
  type ContratoInput,
  type ItemGrade,
} from "../domain/contratos";
import { exigirPermissao, pode } from "../domain/rbac";
import { partesLocais } from "../domain/tempo";
import { materializarRecorrencias } from "./reservas";
import { profissionalDoUsuario } from "./profissionais";
import { ErroNegocio } from "./erros";
import { exigirContratosHabilitados } from "./modulos";

export async function listarContratos(
  ctx: ContextoTenant,
  filtros?: { status?: string; profissionalId?: string; salaId?: string },
  database?: Database,
) {
  exigirContratosHabilitados();
  exigirPermissao(ctx.role, "contratos.ver");

  return withTenant(
    ctx,
    async (tx) => {
      let profissionalFiltroId = filtros?.profissionalId;

      if (!pode(ctx.role, "contratos.gerenciar")) {
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio) return [];
        profissionalFiltroId = proprio.id;
      }

      const condicoes = [];
      if (filtros?.status) {
        condicoes.push(eq(contratosLocacao.status, filtros.status));
      }
      if (profissionalFiltroId) {
        condicoes.push(eq(contratosLocacao.profissionalId, profissionalFiltroId));
      }
      if (filtros?.salaId) {
        condicoes.push(eq(contratosLocacao.salaId, filtros.salaId));
      }

      const linhas = await tx
        .select({
          contrato: contratosLocacao,
          profissionalNome: profissionais.nome,
          profissionalEmail: profissionais.email,
          profissionalEspecialidade: profissionais.especialidade,
          profissionalConselho: profissionais.conselho,
          profissionalRegistro: profissionais.registro,
          salaNome: salas.nome,
        })
        .from(contratosLocacao)
        .innerJoin(profissionais, eq(profissionais.id, contratosLocacao.profissionalId))
        .innerJoin(salas, eq(salas.id, contratosLocacao.salaId))
        .where(condicoes.length > 0 ? and(...condicoes) : undefined)
        .orderBy(desc(contratosLocacao.criadoEm));

      return linhas.map((l) => ({
        ...l.contrato,
        profissional: {
          id: l.contrato.profissionalId,
          nome: l.profissionalNome,
          email: l.profissionalEmail,
          especialidade: l.profissionalEspecialidade,
          conselho: l.profissionalConselho,
          registro: l.profissionalRegistro,
        },
        sala: {
          id: l.contrato.salaId,
          nome: l.salaNome,
        },
      }));
    },
    database,
  );
}

export async function obterContrato(
  ctx: ContextoTenant,
  id: string,
  database?: Database,
) {
  exigirContratosHabilitados();
  exigirPermissao(ctx.role, "contratos.ver");

  return withTenant(
    ctx,
    async (tx) => {
      const [linha] = await tx
        .select({
          contrato: contratosLocacao,
          profissionalNome: profissionais.nome,
          profissionalEmail: profissionais.email,
          profissionalTelefone: profissionais.telefone,
          profissionalConselho: profissionais.conselho,
          profissionalRegistro: profissionais.registro,
          profissionalEspecialidade: profissionais.especialidade,
          profissionalDocumento: profissionais.documento,
          salaNome: salas.nome,
          salaUnidadeId: salas.unidadeId,
          tenantNome: tenants.nome,
          tenantDocumento: tenants.documento,
        })
        .from(contratosLocacao)
        .innerJoin(profissionais, eq(profissionais.id, contratosLocacao.profissionalId))
        .innerJoin(salas, eq(salas.id, contratosLocacao.salaId))
        .innerJoin(tenants, eq(tenants.id, contratosLocacao.tenantId))
        .where(eq(contratosLocacao.id, id));

      if (!linha) throw new ErroNegocio("Contrato não encontrado");

      if (!pode(ctx.role, "contratos.gerenciar")) {
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio || proprio.id !== linha.contrato.profissionalId) {
          throw new ErroNegocio("Você só tem permissão para visualizar os seus contratos");
        }
      }

      // Regras de recorrência ativas vinculadas a este contrato
      const regras = await tx
        .select()
        .from(regrasRecorrencia)
        .where(eq(regrasRecorrencia.contratoId, id));

      // Próximas reservas ativas geradas na agenda para este contrato
      const reservas = await tx
        .select({
          id: reservasSala.id,
          dataOcorrencia: reservasSala.dataOcorrencia,
          periodo: reservasSala.periodo,
          status: reservasSala.status,
        })
        .from(reservasSala)
        .where(
          and(
            eq(reservasSala.status, "ativa"),
            sql`${reservasSala.recorrenciaId} IN (SELECT id FROM ${regrasRecorrencia} WHERE ${regrasRecorrencia.contratoId} = ${id})`,
          ),
        )
        .orderBy(asc(reservasSala.periodo))
        .limit(28);

      const [und] = await tx
        .select({ timezone: unidades.timezone })
        .from(unidades)
        .where(eq(unidades.id, linha.salaUnidadeId));
      const timezone = und?.timezone ?? "America/Sao_Paulo";

      const reservasFormatadas = reservas.map((r) => {
        const ini = partesLocais(r.periodo.inicio, timezone);
        const fim = partesLocais(r.periodo.fim, timezone);
        return {
          id: r.id,
          data: ini.data,
          horaInicio: ini.hora,
          horaFim: fim.hora,
          status: r.status,
        };
      });

      return {
        ...linha.contrato,
        profissional: {
          id: linha.contrato.profissionalId,
          nome: linha.profissionalNome,
          email: linha.profissionalEmail,
          telefone: linha.profissionalTelefone,
          conselho: linha.profissionalConselho,
          registro: linha.profissionalRegistro,
          especialidade: linha.profissionalEspecialidade,
          documento: linha.profissionalDocumento,
        },
        sala: {
          id: linha.contrato.salaId,
          nome: linha.salaNome,
          unidadeId: linha.salaUnidadeId,
        },
        clinica: {
          nome: linha.tenantNome,
          documento: linha.tenantDocumento,
        },
        regras,
        reservas: reservasFormatadas,
      };
    },
    database,
  );
}

export async function criarContrato(
  ctx: ContextoTenant,
  input: ContratoInput,
  agora = new Date(),
  database?: Database,
) {
  exigirContratosHabilitados();
  exigirPermissao(ctx.role, "contratos.gerenciar");
  const dados = contratoInputSchema.parse(input);

  return withTenant(
    ctx,
    async (tx) => {
      // 1. Lock transacional por tenant para geração atômica e segura do código CTR
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.tenantId}))`);

      const ano = agora.getFullYear();
      const prefixo = `CTR-${ano}-%`;
      const [ultimoContrato] = await tx
        .select({ codigo: contratosLocacao.codigo })
        .from(contratosLocacao)
        .where(sql`${contratosLocacao.codigo} LIKE ${prefixo}`)
        .orderBy(desc(contratosLocacao.codigo))
        .limit(1);

      let proximoNumero = 1;
      if (ultimoContrato?.codigo) {
        const partes = ultimoContrato.codigo.split("-");
        const num = parseInt(partes[2] || "0", 10);
        if (!Number.isNaN(num)) proximoNumero = num + 1;
      }
      const codigo = `CTR-${ano}-${proximoNumero.toString().padStart(4, "0")}`;

      // 2. Inserir Contrato
      const [contrato] = await tx
        .insert(contratosLocacao)
        .values({
          codigo,
          profissionalId: dados.profissionalId,
          salaId: dados.salaId,
          status: "ativo",
          dataInicio: dados.dataInicio,
          dataFim: dados.dataFim ?? null,
          valorMensalCentavos: dados.valorMensalCentavos,
          diaVencimento: dados.diaVencimento,
          cobrancaConsultaTipo: dados.cobrancaConsultaTipo,
          cobrancaConsultaValorCentavos: dados.cobrancaConsultaValorCentavos ?? null,
          cobrancaConsultaPercentualBp: dados.cobrancaConsultaPercentualBp ?? null,
          gradeHorarios: dados.gradeHorarios,
          termosContrato: dados.termosContrato,
          observacoes: dados.observacoes ?? null,
        })
        .returning();

      // 3. Criar regras de recorrência para cada item da grade
      for (const item of dados.gradeHorarios) {
        await tx.insert(regrasRecorrencia).values({
          contratoId: contrato.id,
          salaId: dados.salaId,
          profissionalId: dados.profissionalId,
          diaSemana: item.diaSemana,
          horaInicio: item.horaInicio,
          horaFim: item.horaFim,
          dataInicio: dados.dataInicio,
          dataFim: dados.dataFim ?? null,
        });
      }

      // 4. Materializar reservas automáticas exclusivamente para as regras deste contrato
      // Conflitos de horário já são tratados por ocorrência (pulados e auditados). Qualquer outro
      // erro aborta a transação: não dá para engoli-lo e continuar com a transação abortada.
      const mat = await materializarRecorrencias(tx, agora, { contratoId: contrato.id });
      const ocorrenciasCriadas = mat.criadas;
      const conflitos = mat.conflitos;
      const datasConflito = mat.datasConflito ?? [];

      await registrarAuditoria(tx, {
        acao: "contrato.criado",
        entidade: "contratos_locacao",
        entidadeId: contrato.id,
        dados: {
          codigo,
          profissionalId: dados.profissionalId,
          salaId: dados.salaId,
          gradeSlots: dados.gradeHorarios.length,
          ocorrenciasCriadas,
          conflitos,
        },
      });

      return {
        id: contrato.id,
        codigo,
        ocorrenciasCriadas,
        conflitos,
        datasConflito,
      };
    },
    database,
  );
}

export async function encerrarContrato(
  ctx: ContextoTenant,
  id: string,
  agora = new Date(),
  database?: Database,
) {
  exigirContratosHabilitados();
  exigirPermissao(ctx.role, "contratos.gerenciar");

  return withTenant(
    ctx,
    async (tx) => {
      const [contrato] = await tx
        .select()
        .from(contratosLocacao)
        .where(eq(contratosLocacao.id, id))
        .for("update");

      if (!contrato) throw new ErroNegocio("Contrato não encontrado");
      if (contrato.status === "encerrado") {
        throw new ErroNegocio("Este contrato já se encontra encerrado");
      }

      // 1. Atualizar status do contrato
      await tx
        .update(contratosLocacao)
        .set({ status: "encerrado", encerradoEm: agora })
        .where(eq(contratosLocacao.id, id));

      // 2. Encerrar regras de recorrência vinculadas
      await tx
        .update(regrasRecorrencia)
        .set({ encerradaEm: agora })
        .where(eq(regrasRecorrencia.contratoId, id));

      // 3. Cancelar reservas futuras geradas por essas regras sem agendamentos
      const SEM_AGENDAMENTOS = sql`NOT EXISTS (
        SELECT 1 FROM agendamentos a
        WHERE a.reserva_id = reservas_sala.id AND a.status NOT IN ('cancelado', 'falta')
      )`;

      const canceladas = await tx
        .update(reservasSala)
        .set({
          status: "cancelada",
          canceladaEm: agora,
          motivoCancelamento: `Contrato ${contrato.codigo} encerrado`,
        })
        .where(
          and(
            eq(reservasSala.status, "ativa"),
            sql`lower(${reservasSala.periodo}) > ${agora.toISOString()}::timestamptz`,
            sql`recorrencia_id IN (SELECT id FROM regras_recorrencia WHERE contrato_id = ${id})`,
            SEM_AGENDAMENTOS,
          ),
        )
        .returning({ id: reservasSala.id });

      await registrarAuditoria(tx, {
        acao: "contrato.encerrado",
        entidade: "contratos_locacao",
        entidadeId: id,
        dados: { codigo: contrato.codigo, reservasCanceladas: canceladas.length },
      });

      return {
        sucesso: true,
        reservasCanceladas: canceladas.length,
      };
    },
    database,
  );
}

export async function obterDadosParaMinuta(
  ctx: ContextoTenant,
  salaId: string,
  profissionalId: string,
  database?: Database,
) {
  exigirContratosHabilitados();
  exigirPermissao(ctx.role, "contratos.ver");

  return withTenant(
    ctx,
    async (tx) => {
      const [t] = await tx
        .select({ nome: tenants.nome, documento: tenants.documento })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId));

      const [p] = await tx
        .select({
          nome: profissionais.nome,
          conselho: profissionais.conselho,
          registro: profissionais.registro,
        })
        .from(profissionais)
        .where(eq(profissionais.id, profissionalId));

      const [s] = await tx
        .select({ nome: salas.nome })
        .from(salas)
        .where(eq(salas.id, salaId));

      return {
        clinicaNome: t?.nome ?? "",
        clinicaDocumento: t?.documento ?? null,
        profissionalNome: p?.nome ?? "",
        profissionalConselho: p?.conselho ?? null,
        profissionalRegistro: p?.registro ?? null,
        salaNome: s?.nome ?? "",
      };
    },
    database,
  );
}
