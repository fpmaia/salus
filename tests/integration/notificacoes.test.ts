import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { agendamentos, lancamentos, notificacoesOutbox, pacientes } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { criarAcordo } from "../../src/server/financeiro";
import { gerarTokenAgendamento } from "../../src/server/links";
import { acaoDoPaciente, agendarLembretes, obterAgendamentoPublico, processarFila } from "../../src/server/notificacoes";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { ConsoleProvider, ErroEnvio, type MensagemTemplate, type NotificationProvider } from "../../src/server/provider";
import { cancelarReserva, criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// Critérios de pronto da Fase 4:
// - paciente confirma pelo link e o status muda;
// - cancelamento tardio aplica a regra de no-show;
// - envio com falha é reprocessado sem duplicar.

const AGORA = new Date("2030-03-04T15:00:00Z"); // segunda, 12:00 em São Paulo
const TER = "2030-03-05"; // dentro da janela de 24h a partir de AGORA (até 12:00 de terça)

let db: Database;
let admin: ContextoTenant;
let unidadeId: string;
let sala: string;
let profissional: string;
let comConsentimento: string;
let semConsentimento: string;
let semTelefone: string;
const ag: Record<string, string> = {};

class ProviderFalho implements NotificationProvider {
  readonly nome = "falho";
  chamadas: MensagemTemplate[] = [];
  constructor(private falhasRestantes: number, private readonly definitivo = false) {}
  async enviar(m: MensagemTemplate) {
    this.chamadas.push(m);
    if (this.falhasRestantes > 0) {
      this.falhasRestantes--;
      throw new ErroEnvio("Timeout simulado", !this.definitivo);
    }
    return { id: `ok-${this.chamadas.length}` };
  }
}

async function outbox() {
  return withTenant(admin, (tx) => tx.select().from(notificacoesOutbox).orderBy(notificacoesOutbox.criadoEm), db);
}

beforeAll(async () => {
  process.env.LINKS_SECRET = "segredo-de-teste-com-32-caracteres!!";
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Notificacoes");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Avisos", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  ({ id: unidadeId } = await criarUnidade(admin, { nome: "Centro", endereco: "Rua A, 10" }, db));
  ({ id: sala } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
  ({ id: profissional } = await criarProfissional(admin, { nome: "Dra. Ana Lima", email: `ana.${randomUUID()}@teste.dev`, telefone: "(11) 98888-7777" }, db));
  await criarAcordo(
    admin,
    { profissionalId: profissional, modelo: "consulta", valorConsultaCentavos: 3000, regraFalta: "integral", vigenteDe: "2030-01-01" },
    db,
  );
  ({ id: comConsentimento } = await criarPaciente(admin, { nome: "Maria Souza", telefone: "11 99999-0000", consentimentoLembretes: true }, AGORA, db));
  ({ id: semConsentimento } = await criarPaciente(admin, { nome: "João Sem", telefone: "11 99999-1111" }, AGORA, db));
  ({ id: semTelefone } = await criarPaciente(admin, { nome: "Rita Sem Fone", consentimentoLembretes: true }, AGORA, db));

  await criarReserva(admin, { salaId: sala, profissionalId: profissional, data: TER, horaInicio: "08:00", horaFim: "12:00" }, AGORA, db);
  for (const [chave, paciente, ini, fim] of [
    ["maria", comConsentimento, "08:00", "09:00"],
    ["joao", semConsentimento, "09:00", "10:00"],
    ["rita", semTelefone, "10:00", "11:00"],
  ] as const) {
    ag[chave] = (await criarAgendamento(admin, { pacienteId: paciente, profissionalId: profissional, data: TER, horaInicio: ini, horaFim: fim }, AGORA, db)).id;
  }
});

afterAll(async () => {
  await db?.$client.end();
});

describe("agendamento dos lembretes", () => {
  it("enfileira só quem consentiu e tem telefone, mais o lembrete da reserva", async () => {
    const r = await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, AGORA), db);
    expect(r).toEqual({ agendamentos: 1, reservas: 1 });
    const fila = await outbox();
    const paraPaciente = fila.find((n) => n.tipo === "lembrete_agendamento")!;
    expect(paraPaciente).toMatchObject({ destinatario: "+5511999990000", agendamentoId: ag.maria, status: "pendente" });
    expect(paraPaciente.parametros).toMatchObject({ paciente: "Maria", profissional: "Dra. Ana Lima", data: "05/03/2030", hora: "08:00" });
    expect(paraPaciente.parametros.link).toMatch(/\/c\/[\w-]+\.[\w-]+$/);
    expect(fila.find((n) => n.tipo === "lembrete_reserva")?.destinatario).toBe("+5511988887777");
  });

  it("é idempotente", async () => {
    expect(await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, AGORA), db)).toEqual({ agendamentos: 0, reservas: 0 });
  });

  it("fora da janela não enfileira", async () => {
    const cedo = new Date("2030-03-03T10:00:00Z"); // 2 dias antes
    expect(await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, cedo), db)).toEqual({ agendamentos: 0, reservas: 0 });
  });
});

describe("envio", () => {
  it("falha temporária é reprocessada sem duplicar", async () => {
    const provider = new ProviderFalho(1);
    const primeira = await processarFila(admin.tenantId, provider, AGORA, 20, db);
    expect(primeira.falhas).toBe(1);
    expect(primeira.enviadas).toBe(1);
    const falhou = (await outbox()).find((n) => n.status === "pendente")!;
    expect(falhou.tentativas).toBe(1);
    expect(falhou.agendarPara.getTime()).toBe(AGORA.getTime() + 60_000);

    // Antes do backoff vencer, nada sai.
    expect(await processarFila(admin.tenantId, provider, new Date(AGORA.getTime() + 30_000), 20, db)).toEqual({ enviadas: 0, falhas: 0, canceladas: 0 });
    const depois = await processarFila(admin.tenantId, provider, new Date(AGORA.getTime() + 61_000), 20, db);
    expect(depois.enviadas).toBe(1);

    const fila = await outbox();
    expect(fila.every((n) => n.status === "enviado")).toBe(true);
    expect(fila.every((n) => n.mensagemProviderId)).toBe(true);
    // 3 chamadas ao provider para 2 mensagens: cada mensagem saiu uma única vez com sucesso.
    expect(provider.chamadas).toHaveLength(3);
    expect(await processarFila(admin.tenantId, provider, new Date(AGORA.getTime() + 120_000), 20, db)).toEqual({ enviadas: 0, falhas: 0, canceladas: 0 });
  });

  it("erro definitivo marca como falhou sem tentar de novo", async () => {
    const { id } = await criarPaciente(admin, { nome: "Número Ruim", telefone: "11 97777-0000", consentimentoLembretes: true }, AGORA, db);
    await criarAgendamento(admin, { pacienteId: id, profissionalId: profissional, data: TER, horaInicio: "11:00", horaFim: "11:30" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, AGORA), db);
    const r = await processarFila(admin.tenantId, new ProviderFalho(1, true), AGORA, 20, db);
    expect(r.falhas).toBe(1);
    expect((await outbox()).find((n) => n.destinatario === "+5511977770000")?.status).toBe("falhou");
  });

  it("revalida antes de enviar: agendamento cancelado não recebe lembrete", async () => {
    const { id } = await criarPaciente(admin, { nome: "Vai Cancelar", telefone: "11 96666-0000", consentimentoLembretes: true }, AGORA, db);
    const { id: agendamento } = await criarAgendamento(admin, { pacienteId: id, profissionalId: profissional, data: TER, horaInicio: "11:30", horaFim: "12:00" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, AGORA), db);
    await withTenant(admin, (tx) => tx.update(agendamentos).set({ status: "cancelado" }).where(eq(agendamentos.id, agendamento)), db);
    const r = await processarFila(admin.tenantId, new ConsoleProvider(), AGORA, 20, db);
    expect(r).toMatchObject({ enviadas: 0, canceladas: 1 });
  });

  it("cancelar a reserva cancela o lembrete pendente do profissional", async () => {
    const { id } = await criarReserva(admin, { salaId: sala, profissionalId: profissional, data: TER, horaInicio: "14:00", horaFim: "15:00" }, AGORA, db);
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, new Date("2030-03-04T18:00:00Z")), db);
    await cancelarReserva(admin, id, null, AGORA, db);
    const n = (await outbox()).find((x) => x.reservaId === id)!;
    expect(n.status).toBe("cancelado");
  });
});

describe("link do paciente", () => {
  const token = () => gerarTokenAgendamento(admin.tenantId, ag.maria, new Date("2030-03-05T12:00:00Z"));

  it("mostra só dados mínimos", async () => {
    expect(await obterAgendamentoPublico(token(), AGORA, db)).toEqual({
      pacienteNome: "Maria",
      profissionalNome: "Dra. Ana Lima",
      data: "05/03/2030",
      hora: "08:00",
      local: "Centro — Rua A, 10",
      status: "agendado",
      recebeLembretes: true,
    });
    expect(await obterAgendamentoPublico("token.invalido", AGORA, db)).toBeNull();
  });

  it("paciente confirma pelo link e o status muda", async () => {
    expect((await acaoDoPaciente(token(), "confirmar", AGORA, db)).mensagem).toMatch(/confirmado/);
    const [a] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, ag.maria)), db);
    expect(a.status).toBe("confirmado");
    // Repetir é inofensivo.
    expect((await acaoDoPaciente(token(), "confirmar", AGORA, db)).mensagem).toMatch(/já estava confirmado/);
  });

  it("cancelamento tardio pelo link aplica a regra de falta", async () => {
    const duasHorasAntes = new Date("2030-03-05T09:00:00Z"); // 06:00 local; início 08:00
    expect((await acaoDoPaciente(token(), "cancelar", duasHorasAntes, db)).mensagem).toMatch(/pouca antecedência/);
    const [a] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, ag.maria)), db);
    expect(a).toMatchObject({ status: "cancelado", cancelamentoTardio: true });
    const cobranca = await withTenant(
      admin,
      (tx) => tx.select().from(lancamentos).where(and(eq(lancamentos.origem, `agendamento:${ag.maria}`), eq(lancamentos.tipo, "falta"))),
      db,
    );
    expect(cobranca.map((l) => l.valorCentavos)).toEqual([3000]);
    await expect(acaoDoPaciente(token(), "confirmar", duasHorasAntes, db)).rejects.toThrow("não pode mais ser alterado");
  });

  it("parar lembretes retira o consentimento e cancela os pendentes", async () => {
    const { id: agendamento } = await criarAgendamento(
      admin,
      { pacienteId: comConsentimento, profissionalId: profissional, data: "2030-03-06", horaInicio: "08:00", horaFim: "09:00", salaId: sala },
      AGORA,
      db,
    );
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, new Date("2030-03-05T15:00:00Z")), db);
    const t = gerarTokenAgendamento(admin.tenantId, agendamento, new Date("2030-03-06T12:00:00Z"));
    await acaoDoPaciente(t, "parar_lembretes", AGORA, db);
    const [p] = await withTenant(admin, (tx) => tx.select().from(pacientes).where(eq(pacientes.id, comConsentimento)), db);
    expect(p.consentimentoLembretes).toBe(false);
    expect((await outbox()).find((n) => n.agendamentoId === agendamento)?.status).toBe("cancelado");
  });

  it("link de outro tenant ou expirado não funciona", async () => {
    const erro = await capturarErro(acaoDoPaciente(gerarTokenAgendamento(randomUUID(), ag.joao, new Date("2030-03-05T12:00:00Z")), "cancelar", AGORA, db));
    expect((erro as Error).message).toMatch(/não encontrado/);
    await expect(acaoDoPaciente(gerarTokenAgendamento(admin.tenantId, ag.joao, AGORA), "cancelar", AGORA, db)).rejects.toThrow("expirado");
  });

  it("realizar o atendimento cancela lembretes pendentes", async () => {
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, AGORA), db);
    await alterarStatusAgendamento(admin, ag.joao, "falta", null, new Date("2030-03-05T13:30:00Z"), db);
    expect((await outbox()).filter((n) => n.agendamentoId === ag.joao && n.status === "pendente")).toEqual([]);
  });
});
