import { and, eq, lte, sql } from "drizzle-orm";
import { registrarAuditoria } from "../db/audit";
import { getDb, type Database, type Transaction } from "../db/client";
import { notificacoesOutbox, whatsappConexoes } from "../db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../db/tenant";
import { exigirPermissao } from "../domain/rbac";
import { ErroNegocio } from "./erros";
import { ErroEvolution, EvolutionProvider, evolutionDoAmbiente, instanciaDoTenant, type ClienteWhatsappQr } from "./evolution";
import type { NotificationProvider } from "./provider";

// Conexão do WhatsApp do espaço por QR Code (Evolution API). Enquanto o número não estiver
// conectado, os lembretes ficam na fila e saem quando ele voltar (os vencidos são descartados).

type Opcoes = { cliente?: ClienteWhatsappQr | null; database?: Database; agora?: Date };

const clienteDe = (opcoes: Opcoes) => (opcoes.cliente === undefined ? evolutionDoAmbiente() : opcoes.cliente);

function exigirCliente(opcoes: Opcoes): ClienteWhatsappQr {
  const cliente = clienteDe(opcoes);
  if (!cliente) throw new ErroNegocio("O WhatsApp por QR Code não está habilitado neste servidor");
  return cliente;
}

function traduzir(erro: unknown): never {
  if (erro instanceof ErroEvolution) throw new ErroNegocio(`Não foi possível falar com o WhatsApp agora: ${erro.message}`);
  throw erro;
}

/** Situação da conexão para a tela de configuração. */
export async function conexaoWhatsapp(ctx: ContextoTenant, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "tenant.configurar");
  const disponivel = clienteDe(opcoes) !== null;
  const [conexao] = await withTenant(ctx, (tx) => tx.select().from(whatsappConexoes), opcoes.database);
  const [{ pendentes }] = await withTenant(
    ctx,
    (tx) => tx.select({ pendentes: sql<number>`count(*)::int` }).from(notificacoesOutbox).where(eq(notificacoesOutbox.status, "pendente")),
    opcoes.database,
  );
  return { disponivel, conexao: conexao ?? null, pendentes };
}

/**
 * Começa a conexão: registra o aceite do risco (QR Code não é a API oficial; o número pode ser
 * bloqueado) e devolve o QR Code para ler no celular do espaço.
 */
export async function conectarWhatsapp(ctx: ContextoTenant, dados: { aceitoRisco: boolean }, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "tenant.configurar");
  if (!dados.aceitoRisco) throw new ErroNegocio("Confirme que entende o risco de bloqueio do número");
  const cliente = exigirCliente(opcoes);
  const agora = opcoes.agora ?? new Date();
  const instancia = instanciaDoTenant(ctx.tenantId);
  const qr = await cliente.conectar(instancia).catch(traduzir);
  await withTenant(
    ctx,
    async (tx) => {
      await tx
        .insert(whatsappConexoes)
        .values({ instancia, status: "conectando", riscoAceitoEm: agora, riscoAceitoPor: ctx.userId })
        .onConflictDoUpdate({
          target: whatsappConexoes.tenantId,
          set: { status: "conectando", riscoAceitoEm: agora, riscoAceitoPor: ctx.userId, atualizadoEm: agora },
        });
      await registrarAuditoria(tx, { acao: "whatsapp.conectando", entidade: "whatsapp_conexoes", entidadeId: instancia, dados: { riscoAceito: true } });
    },
    opcoes.database,
  );
  return qr;
}

/** Consulta a Evolution e grava o estado (a tela chama enquanto mostra o QR Code). */
export async function verificarConexaoWhatsapp(ctx: ContextoTenant, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "tenant.configurar");
  const cliente = exigirCliente(opcoes);
  const { estado, numero } = await cliente.estado(instanciaDoTenant(ctx.tenantId)).catch(traduzir);
  return withTenant(ctx, (tx) => gravarEstado(tx, estado, numero, opcoes.agora ?? new Date()), opcoes.database);
}

export async function desconectarWhatsapp(ctx: ContextoTenant, opcoes: Opcoes = {}) {
  exigirPermissao(ctx.role, "tenant.configurar");
  const cliente = exigirCliente(opcoes);
  await cliente.desconectar(instanciaDoTenant(ctx.tenantId)).catch(traduzir);
  await withTenant(
    ctx,
    async (tx) => {
      await tx.update(whatsappConexoes).set({ status: "desconectado", numero: null, conectadoEm: null });
      await registrarAuditoria(tx, { acao: "whatsapp.desconectado", entidade: "whatsapp_conexoes", entidadeId: instanciaDoTenant(ctx.tenantId) });
    },
    opcoes.database,
  );
}

async function gravarEstado(tx: Transaction, estado: "open" | "connecting" | "close", numero: string | null, agora: Date) {
  const [atual] = await tx.select().from(whatsappConexoes);
  if (!atual) return "desconectado" as const;
  const status = estado === "open" ? "conectado" : estado === "connecting" ? "conectando" : "desconectado";
  if (status !== atual.status || (numero && numero !== atual.numero)) {
    await tx
      .update(whatsappConexoes)
      .set({
        status,
        numero: numero ?? (status === "conectado" ? atual.numero : null),
        conectadoEm: status === "conectado" ? (atual.status === "conectado" ? atual.conectadoEm : agora) : null,
      });
    await registrarAuditoria(tx, { acao: `whatsapp.${status}`, entidade: "whatsapp_conexoes", entidadeId: atual.instancia });
  }
  return status;
}

/**
 * Provider do espaço para o worker: com a Evolution, só envia se houver mensagem na hora e o
 * número estiver conectado (consulta o estado antes). null = nada a enviar agora.
 */
export async function providerDoTenant(
  tenantId: string,
  cliente: ClienteWhatsappQr,
  agora = new Date(),
  database: Database = getDb(),
): Promise<NotificationProvider | null> {
  const { conexao, pendentes } = await withSistema(
    tenantId,
    async (tx) => ({
      conexao: (await tx.select().from(whatsappConexoes))[0],
      pendentes: (
        await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(notificacoesOutbox)
          .where(and(eq(notificacoesOutbox.status, "pendente"), lte(notificacoesOutbox.agendarPara, agora)))
      )[0].n,
    }),
    database,
  );
  if (!conexao || pendentes === 0) return null;
  const { estado, numero } = await cliente.estado(conexao.instancia);
  const status = await withSistema(tenantId, (tx) => gravarEstado(tx, estado, numero, agora), database);
  return status === "conectado" ? new EvolutionProvider(cliente, conexao.instancia) : null;
}
