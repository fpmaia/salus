import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { agendamentos, memberships, pacientes, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { criarAgendamento } from "../../src/server/agendamentos";
import { agendarOnline, configurarAgendamentoOnline, obterPaginaPublica } from "../../src/server/agendamento-online";
import { lerTokenAgendamento } from "../../src/server/links";
import { definirModulos } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";

// Agendamento online público: só dentro das reservas do profissional, revalidando o
// horário escolhido, reaproveitando o paciente pelo celular e com limites contra abuso.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const TER = "2030-03-05";

let db: Database;
let admin: ContextoTenant;
let anaCtx: ContextoTenant;
let ana: string;
let sala: string;
let slug: string;

const horasDoDia = async (data: string) =>
  ((await obterPaginaPublica(slug, AGORA, db))?.dias.find((d) => d.data === data)?.horarios ?? []).map((h) => h.hora);
const isoDe = async (data: string, hora: string) =>
  (await obterPaginaPublica(slug, AGORA, db))!.dias.find((d) => d.data === data)!.horarios.find((h) => h.hora === hora)!.iso;
const pedido = (inicio: string, extra: Record<string, unknown> = {}) => ({
  inicio,
  nome: "Maria Souza",
  telefone: "(11) 99999-0000",
  consentimentoLembretes: true,
  aceitePrivacidade: true as const,
  ...extra,
});

beforeAll(async () => {
  process.env.LINKS_SECRET = "segredo-de-teste-com-32-caracteres!!";
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Online");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Online", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  // Módulo opcional: o espaço liga o agendamento online.
  await definirModulos(admin, { fiscal: false, agendaOnline: true, prontuario: false }, db);
  const { id: unidade } = await criarUnidade(admin, { nome: "Centro", endereco: "Rua A, 10" }, db); // seg–sex 08–18, slot 30
  ({ id: sala } = await criarSala(admin, unidade, { nome: "Sala 1" }, db));
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana Lima", email: `ana.${randomUUID()}@teste.dev`, especialidade: "Psicologia" }, db));
  const anaUser = await criarUsuario(db, "Ana Online");
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId: anaUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, ana));
    },
    db,
  );
  anaCtx = { tenantId, userId: anaUser, role: "profissional" };

  await criarReserva(admin, { salaId: sala, profissionalId: ana, data: TER, horaInicio: "08:00", horaFim: "12:00" }, AGORA, db);
  const { id: existente } = await criarPaciente(admin, { nome: "Paciente da Recepção" }, AGORA, db);
  await criarAgendamento(admin, { pacienteId: existente, profissionalId: ana, data: TER, horaInicio: "09:00", horaFim: "10:00" }, AGORA, db);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("configuração", () => {
  it("a profissional ativa a própria agenda online e ganha um slug", async () => {
    ({ slug } = (await configurarAgendamentoOnline(
      anaCtx,
      { ativo: true, duracaoConsultaMin: 60, antecedenciaMinHoras: 2, janelaDias: 14, mensagemPublica: "Atendimento adulto" },
      db,
    )) as { slug: string });
    expect(slug).toMatch(/^dra-ana-lima-[0-9a-f]{6}$/);
  });

  it("com o módulo desligado no espaço, a página pública não abre", async () => {
    await definirModulos(admin, { fiscal: false, agendaOnline: false, prontuario: false }, db);
    expect(await obterPaginaPublica(slug, AGORA, db)).toBeNull();
    await definirModulos(admin, { fiscal: false, agendaOnline: true, prontuario: false }, db);
    expect(await obterPaginaPublica(slug, AGORA, db)).not.toBeNull();
  });

  it("slug inválido ou inexistente não abre página", async () => {
    expect(await obterPaginaPublica("nao-existe-123", AGORA, db)).toBeNull();
    expect(await obterPaginaPublica("'; drop table x; --", AGORA, db)).toBeNull();
  });
});

describe("página pública", () => {
  it("oferece horários só dentro da reserva, sem colidir com atendimentos", async () => {
    const pagina = await obterPaginaPublica(slug, AGORA, db);
    expect(pagina?.profissional).toMatchObject({ nome: "Dra. Ana Lima", especialidade: "Psicologia", mensagem: "Atendimento adulto", duracaoMin: 60 });
    expect(pagina?.locais).toEqual([{ nome: "Centro", endereco: "Rua A, 10" }]);
    // 08:30 e 09:xx colidem com 09–10; 11:30 não cabe 60 min antes do fim (12:00).
    expect(await horasDoDia(TER)).toEqual(["08:00", "10:00", "10:30", "11:00"]);
  });
});

describe("agendamento", () => {
  let pacienteId: string;

  it("cria o paciente, marca como online e devolve o link de gestão", async () => {
    const r = await agendarOnline(slug, pedido(await isoDe(TER, "10:00")), AGORA, db);
    expect(r).toMatchObject({ data: "05/03/2030", hora: "10:00", profissional: "Dra. Ana Lima", local: "Centro — Rua A, 10", paciente: "Maria" });
    const token = r.link.split("/c/")[1];
    const payload = lerTokenAgendamento(token, AGORA)!;
    const [a] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, payload.agendamentoId)), db);
    expect(a).toMatchObject({ origem: "online", status: "agendado" });
    pacienteId = a.pacienteId;
    const [p] = await withTenant(admin, (tx) => tx.select().from(pacientes).where(eq(pacientes.id, pacienteId)), db);
    expect(p).toMatchObject({ telefone: "+5511999990000", consentimentoLembretes: true });
    expect(await horasDoDia(TER)).toEqual(["08:00", "11:00"]);
  });

  it("reaproveita o paciente pelo celular, sem alterar o cadastro", async () => {
    const r = await agendarOnline(slug, pedido(await isoDe(TER, "08:00"), { nome: "Outro Nome", telefone: "11999990000" }), AGORA, db);
    const token = lerTokenAgendamento(r.link.split("/c/")[1], AGORA)!;
    const [a] = await withTenant(admin, (tx) => tx.select().from(agendamentos).where(eq(agendamentos.id, token.agendamentoId)), db);
    expect(a.pacienteId).toBe(pacienteId);
    const [p] = await withTenant(admin, (tx) => tx.select().from(pacientes).where(eq(pacientes.id, pacienteId)), db);
    expect(p.nome).toBe("Maria Souza");
  });

  it("recusa horário forjado ou já ocupado", async () => {
    await expect(agendarOnline(slug, pedido("2030-03-05T11:15:00.000Z"), AGORA, db)).rejects.toThrow("não está mais disponível");
    await expect(agendarOnline(slug, pedido("2030-03-05T13:00:00.000Z"), AGORA, db)).rejects.toThrow("não está mais disponível"); // 10:00, já marcado
    await expect(agendarOnline(slug, pedido("2030-03-07T13:00:00.000Z"), AGORA, db)).rejects.toThrow("não está mais disponível"); // sem reserva
  });

  it("limita agendamentos futuros por paciente", async () => {
    await agendarOnline(slug, pedido(await isoDe(TER, "11:00")), AGORA, db);
    await criarReserva(admin, { salaId: sala, profissionalId: ana, data: "2030-03-06", horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
    await expect(agendarOnline(slug, pedido(await isoDe("2030-03-06", "08:00")), AGORA, db)).rejects.toThrow("já tem agendamentos futuros");
    // Outro paciente consegue.
    await agendarOnline(slug, pedido(await isoDe("2030-03-06", "08:00"), { nome: "João Lima", telefone: "11 98888-1111" }), AGORA, db);
  });

  it("valida os dados e barra robôs pelo campo-isca", async () => {
    const livre = await isoDe("2030-03-06", "09:00");
    await expect(agendarOnline(slug, pedido(livre, { telefone: "1234" }), AGORA, db)).rejects.toThrow("celular válido");
    await expect(agendarOnline(slug, pedido(livre, { aceitePrivacidade: false }), AGORA, db)).rejects.toThrow("aceitar");
    await expect(agendarOnline(slug, pedido(livre, { site: "http://spam" }), AGORA, db)).rejects.toThrow("Não foi possível");
  });

  it("desativar fecha a página e o agendamento", async () => {
    await configurarAgendamentoOnline(admin, { profissionalId: ana, ativo: false, duracaoConsultaMin: 60, antecedenciaMinHoras: 2, janelaDias: 14 }, db);
    expect(await obterPaginaPublica(slug, AGORA, db)).toBeNull();
    await expect(agendarOnline(slug, pedido("2030-03-06T12:00:00.000Z", { telefone: "11 97777-2222" }), AGORA, db)).rejects.toThrow("indisponível");
  });
});
