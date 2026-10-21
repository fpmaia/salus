import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database } from "../db/client";
import { datasNaoReservadas, profissionais, salas, tenants } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { primeiroNome } from "../domain/notificacoes";
import { exigirPermissao, pode } from "../domain/rbac";
import { emailDoAmbiente, type ProvedorEmail } from "./email";
import { emailDatasNaoReservadas } from "./email-modelos";
import { ErroNegocio } from "./erros";
import { profissionalDoUsuario } from "./profissionais";
import { formatarDataBr } from "./reservas";
import { urlPublica } from "./links";

// Datas de séries recorrentes que o worker não conseguiu reservar (C10): o profissional é
// avisado por e-mail e a pendência fica visível até a equipe resolver ou a data passar.

const hora = (t: string) => t.slice(0, 5);
const ontem = (agora: Date) => new Date(agora.getTime() - 86_400_000).toISOString().slice(0, 10);

/** Job do worker: um e-mail por profissional com as datas ainda não avisadas. */
export async function avisarDatasNaoReservadas(
  tenantId: string,
  opcoes: { agora?: Date; provedor?: ProvedorEmail; database?: Database } = {},
): Promise<{ avisos: number; datas: number }> {
  const agora = opcoes.agora ?? new Date();
  const database = opcoes.database ?? getDb();
  const { espaco, linhas } = await withSistema(
    tenantId,
    async (tx) => ({
      espaco: (await tx.select({ nome: tenants.nome }).from(tenants))[0]?.nome ?? "",
      linhas: await tx
        .select({ d: datasNaoReservadas, email: profissionais.email, nome: profissionais.nome, sala: salas.nome })
        .from(datasNaoReservadas)
        .innerJoin(profissionais, eq(profissionais.id, datasNaoReservadas.profissionalId))
        .innerJoin(salas, eq(salas.id, datasNaoReservadas.salaId))
        .where(and(isNull(datasNaoReservadas.avisadoEm), isNull(datasNaoReservadas.resolvidaEm), gte(datasNaoReservadas.data, ontem(agora))))
        .orderBy(asc(datasNaoReservadas.data)),
    }),
    database,
  );
  const porProfissional = new Map<string, typeof linhas>();
  for (const l of linhas) porProfissional.set(l.d.profissionalId, [...(porProfissional.get(l.d.profissionalId) ?? []), l]);
  if (porProfissional.size === 0) return { avisos: 0, datas: 0 };

  const provedor = opcoes.provedor ?? emailDoAmbiente();
  const url = `${urlPublica()}/painel/agenda`;
  let avisos = 0;
  let datas = 0;
  for (const doProfissional of porProfissional.values()) {
    const { email, nome } = doProfissional[0];
    const ids = doProfissional.map((l) => l.d.id);
    if (email) {
      // Falha no envio: fica para a próxima rodada (não marca como avisado).
      const enviado = await provedor
        .enviar(
          emailDatasNaoReservadas(email, {
            nome: primeiroNome(nome),
            espaco,
            datas: doProfissional.map((l) => `${formatarDataBr(l.d.data)}, ${hora(l.d.horaInicio)}–${hora(l.d.horaFim)} (${l.sala})`),
            url,
          }),
        )
        .then(() => true)
        .catch(() => false);
      if (!enviado) continue;
      avisos++;
    }
    datas += ids.length;
    await withSistema(tenantId, (tx) => tx.update(datasNaoReservadas).set({ avisadoEm: agora }).where(inArray(datasNaoReservadas.id, ids)), database);
  }
  return { avisos, datas };
}

export type DataNaoReservada = { id: string; data: string; horaInicio: string; horaFim: string; salaNome: string; profissionalNome: string };

/** Pendências a partir de hoje: a equipe vê todas; o profissional, só as dele. */
export async function listarDatasNaoReservadas(ctx: ContextoTenant, agora = new Date(), database?: Database): Promise<DataNaoReservada[]> {
  return withTenant(
    ctx,
    async (tx) => {
      let somente: string | null = null;
      if (!pode(ctx.role, "agenda.gerenciar")) {
        const proprio = await profissionalDoUsuario(tx, ctx.userId);
        if (!proprio) return [];
        somente = proprio.id;
      }
      const linhas = await tx
        .select({ d: datasNaoReservadas, salaNome: salas.nome, profissionalNome: profissionais.nome })
        .from(datasNaoReservadas)
        .innerJoin(profissionais, eq(profissionais.id, datasNaoReservadas.profissionalId))
        .innerJoin(salas, eq(salas.id, datasNaoReservadas.salaId))
        .where(
          and(
            isNull(datasNaoReservadas.resolvidaEm),
            gte(datasNaoReservadas.data, agora.toISOString().slice(0, 10)),
            somente ? eq(datasNaoReservadas.profissionalId, somente) : undefined,
          ),
        )
        .orderBy(asc(datasNaoReservadas.data));
      return linhas.map(({ d, salaNome, profissionalNome }) => ({
        id: d.id,
        data: d.data,
        horaInicio: hora(d.horaInicio),
        horaFim: hora(d.horaFim),
        salaNome,
        profissionalNome,
      }));
    },
    database,
  );
}

/** A equipe resolveu (outra sala, outro horário ou combinou com o profissional). */
export async function resolverDataNaoReservada(ctx: ContextoTenant, id: string, agora = new Date(), database?: Database) {
  exigirPermissao(ctx.role, "agenda.gerenciar");
  await withTenant(
    ctx,
    async (tx) => {
      const alteradas = await tx
        .update(datasNaoReservadas)
        .set({ resolvidaEm: agora })
        .where(and(eq(datasNaoReservadas.id, id), isNull(datasNaoReservadas.resolvidaEm)))
        .returning({ id: datasNaoReservadas.id });
      if (alteradas.length === 0) throw new ErroNegocio("Pendência não encontrada");
      await registrarAuditoria(tx, { acao: "recorrencia.conflito_resolvido", entidade: "datas_nao_reservadas", entidadeId: id });
    },
    database,
  );
}
