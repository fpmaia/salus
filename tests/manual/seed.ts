import { writeFileSync } from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { opcoesAuth } from "../../src/auth/config";
import { createDb } from "../../src/db/client";
import { aplicarMigrations } from "../../src/db/migrator";
import { memberships, profissionais, users } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { agendarLembretes, processarFila } from "../../src/server/notificacoes";
import { ConsoleProvider } from "../../src/server/provider";
import { hojeNoFuso, somarDias } from "../../src/domain/tempo";
import { definirProvedorEmail, EmailMemoria } from "../../src/server/email";
import { registrarAceite } from "../../src/server/aceites";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { criarAcordo, definirValorAgendamento } from "../../src/server/financeiro";
import { adicionarNaEspera } from "../../src/server/lista-espera";
import { listarMembershipsDoUsuario } from "../../src/server/memberships";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { gerarTokenAgendamento } from "../../src/server/links";
import { criarPaciente } from "../../src/server/pacientes";
import { criarProfissional, gerarConvite } from "../../src/server/profissionais";
import { concluirReservasPassadas, criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade, definirHorarios } from "../../src/server/unidades";
import { configurarAgendamentoOnline } from "../../src/server/agendamento-online";
import { GatewaySimulado } from "../../src/server/asaas";
import { ativarLicencaProntuario, gerarFaturaDoMes } from "../../src/server/assinatura";
import { definirModulos } from "../../src/server/modulos";
import { finalizarRegistro, salvarRascunho } from "../../src/server/prontuario";

export const SENHA = "salus-manual-123";
export const EMAIL = {
  admin: "mariana@vidasaude.com.br",
  recepcao: "juliana@vidasaude.com.br",
  profissional: "helena.costa@vidasaude.com.br",
  // Dono da plataforma (área /plataforma) e o admin de um espaço com a fatura em atraso.
  superadmin: "suporte@salus.app",
  atraso: "rodrigo@clinicabemestar.com.br",
};

// Espaço de demonstração do manual do usuário ("Espaço Vida Saúde"), criado pelos serviços do
// app no banco salus_test (o mesmo do E2E: não rode junto com o `npm test` nem com o E2E).
export default async function setup() {
  const migrador = process.env.TEST_DATABASE_MIGRATOR_URL ?? "postgres://salus_owner:salus_owner_dev@localhost:5433/salus_test";
  const app = process.env.TEST_DATABASE_URL ?? "postgres://salus_app:salus_app_dev@localhost:5433/salus_test";
  const client = new Client({ connectionString: migrador });
  await client.connect();
  await client.query(`
    DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public; REVOKE CREATE ON SCHEMA public FROM PUBLIC;`);
  await client.end();
  await aplicarMigrations(migrador);

  const db = createDb(app);
  const auth = betterAuth(opcoesAuth(db));
  definirProvedorEmail(new EmailMemoria());
  const agoraReal = new Date();
  // Mesma chave do servidor do E2E (playwright.config.ts): o prontuário do seed é cifrado com ela.
  process.env.SECRETS_KEY ||= Buffer.alloc(32, 7).toString("base64");
  try {
    const ids: Record<string, string> = {};
    for (const [role, nome] of [
      ["admin", "Mariana Alves"],
      ["recepcao", "Juliana Souza"],
      ["profissional", "Dra. Helena Costa"],
      ["superadmin", "Equipe Salus"],
      ["atraso", "Rodrigo Nunes"],
    ] as const) {
      const { user } = await auth.api.signUpEmail({ body: { name: nome, email: EMAIL[role], password: SENHA } });
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
      await registrarAceite(user.id, "script", {}, db);
      ids[role] = user.id;
    }
    await criarTenantComAdmin(ids.admin, { nomeTenant: "Espaço Vida Saúde", documento: "11.222.333/0001-81" }, db);
    const [m0] = await listarMembershipsDoUsuario(ids.admin, db);
    const admin: ContextoTenant = { tenantId: m0.tenantId, userId: ids.admin, role: "admin" };

    const helena = await withTenant(
      admin,
      async (tx) => {
        await tx.insert(memberships).values([
          { userId: ids.recepcao, role: "recepcao" },
          { userId: ids.profissional, role: "profissional" },
        ]);
        const [m] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, ids.profissional), eq(memberships.role, "profissional")));
        const [p] = await tx
          .insert(profissionais)
          .values({ nome: "Dra. Helena Costa", email: EMAIL.profissional, conselho: "CRP", registro: "06/123456", especialidade: "Psicologia clínica", membershipId: m.id })
          .returning({ id: profissionais.id });
        return p.id;
      },
      db,
    );
    const { id: rafael } = await criarProfissional(admin, { nome: "Dr. Rafael Lima", email: "rafael.lima@vidasaude.com.br", conselho: "CRM", registro: "SP 154321", especialidade: "Psiquiatria", telefone: "(11) 98888-1200" }, db);
    const { id: camila } = await criarProfissional(admin, { nome: "Dra. Camila Rocha", email: "camila.rocha@vidasaude.com.br", conselho: "CRN", registro: "3/45678", especialidade: "Nutrição", telefone: "(11) 97777-3400" }, db);
    const { token: tokenConvite } = await gerarConvite(admin, camila, new Date(), db);

    const { id: unidade } = await criarUnidade(admin, { nome: "Unidade Paulista", endereco: "Av. Paulista, 1000 – Bela Vista, São Paulo/SP" }, db);
    await definirHorarios(admin, unidade, [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, abre: "07:00", fecha: "21:00" })), db);
    const { id: c1 } = await criarSala(admin, unidade, { nome: "Consultório 1" }, db);
    const { id: c2 } = await criarSala(admin, unidade, { nome: "Consultório 2" }, db);
    const { id: grupo } = await criarSala(admin, unidade, { nome: "Sala de grupo" }, db);

    const pac: Record<string, string> = {};
    for (const [chave, nome, telefone] of [
      ["ana", "Ana Beatriz Martins", "(11) 91234-5678"],
      ["bruno", "Bruno Henrique Dias", "(11) 92345-6789"],
      ["carla", "Carla Nogueira", "(11) 93456-7890"],
      ["diego", "Diego Ferreira", "(11) 94567-8901"],
      ["elisa", "Elisa Prado", "(11) 95678-9012"],
      ["fabio", "Fábio Moreira", "(11) 96789-0123"],
      ["gabriela", "Gabriela Torres", "(11) 97890-1234"],
    ] as const) {
      pac[chave] = (await criarPaciente(admin, { nome, telefone, consentimentoLembretes: true }, new Date(), db)).id;
    }

    const hoje = hojeNoFuso("America/Sao_Paulo");
    const mesAtual = `${hoje.slice(0, 7)}-01`;
    const mesAnterior = `${somarDias(mesAtual, -1).slice(0, 7)}-01`;
    await criarAcordo(admin, { profissionalId: helena, modelo: "hora", valorHoraCentavos: 4500, vigenteDe: mesAnterior }, db);
    await criarAcordo(admin, { profissionalId: rafael, modelo: "hora", valorHoraCentavos: 6000, vigenteDe: mesAnterior }, db);

    const instante = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`);
    const criadaEm = new Date(`${mesAnterior}T12:00:00Z`);

    // Mês anterior: consultas realizadas e pagas (base do financeiro e do recibo).
    let atendimentoPago = "";
    for (const dia of ["06", "13", "20"]) {
      const data = `${mesAnterior.slice(0, 7)}-${dia}`;
      const { id: reserva } = await criarReserva(admin, { salaId: c1, profissionalId: helena, data, horaInicio: "09:00", horaFim: "12:00" }, criadaEm, db);
      for (const [paciente, inicio, fim] of [
        [pac.ana, "09:00", "10:00"],
        [pac.bruno, "10:00", "11:00"],
      ] as const) {
        const { id } = await criarAgendamento(admin, { pacienteId: paciente, reservaId: reserva, data, horaInicio: inicio, horaFim: fim }, criadaEm, db);
        const durante = instante(data, inicio);
        await alterarStatusAgendamento(admin, id, "presente", null, durante, db);
        await alterarStatusAgendamento(admin, id, "realizado", null, durante, db);
        await definirValorAgendamento(admin, id, 25000, durante, db);
        atendimentoPago ||= id;
      }
    }

    // Hoje: Helena de manhã no Consultório 1, Rafael à tarde no Consultório 2.
    const { id: resHelena } = await criarReserva(admin, { salaId: c1, profissionalId: helena, data: hoje, horaInicio: "08:00", horaFim: "12:00" }, criadaEm, db);
    const consultasHoje: [string, string, string, string[]][] = [
      [pac.carla, "08:00", "09:00", ["confirmado", "presente", "realizado"]],
      [pac.diego, "09:00", "10:00", ["confirmado", "presente"]],
      [pac.elisa, "10:00", "11:00", ["confirmado"]],
      [pac.ana, "11:00", "12:00", []],
    ];
    for (const [paciente, inicio, fim, status] of consultasHoje) {
      const { id } = await criarAgendamento(admin, { pacienteId: paciente, reservaId: resHelena, data: hoje, horaInicio: inicio, horaFim: fim }, criadaEm, db);
      for (const s of status) await alterarStatusAgendamento(admin, id, s as "confirmado", null, instante(hoje, inicio), db).catch(() => undefined);
    }
    const { id: resRafael } = await criarReserva(admin, { salaId: c2, profissionalId: rafael, data: hoje, horaInicio: "13:00", horaFim: "18:00" }, criadaEm, db);
    for (const [paciente, inicio, fim] of [
      [pac.fabio, "14:00", "15:00"],
      [pac.gabriela, "15:30", "16:30"],
    ] as const) {
      await criarAgendamento(admin, { pacienteId: paciente, reservaId: resRafael, data: hoje, horaInicio: inicio, horaFim: fim }, criadaEm, db);
    }

    // Amanhã: uma consulta da Helena com link do paciente.
    const amanha = somarDias(hoje, 1);
    const { id: resAmanha } = await criarReserva(admin, { salaId: c1, profissionalId: helena, data: amanha, horaInicio: "14:00", horaFim: "18:00" }, criadaEm, db);
    const { id: consultaLink } = await criarAgendamento(admin, { pacienteId: pac.bruno, reservaId: resAmanha, data: amanha, horaInicio: "15:00", horaFim: "16:00" }, criadaEm, db);
    const linkPaciente = `/c/${gerarTokenAgendamento(admin.tenantId, consultaLink, new Date(agoraReal.getTime() + 7 * 86_400_000))}`;

    // Consulta que começa na próxima hora cheia (check-in liberado 1h antes), para a animação do check-in.
    const proximaHora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agoraReal)) + 1;
    let pacienteCheckin: string | null = null;
    if (proximaHora >= 7 && proximaHora <= 20) {
      const inicio = `${String(proximaHora).padStart(2, "0")}:00`;
      const fim = `${String(proximaHora + 1).padStart(2, "0")}:00`;
      const { id: heitor } = await criarPaciente(admin, { nome: "Heitor Campos", telefone: "(11) 98123-4567", consentimentoLembretes: true }, new Date(), db);
      const { id: resGrupo } = await criarReserva(admin, { salaId: grupo, profissionalId: camila, data: hoje, horaInicio: inicio, horaFim: fim }, criadaEm, db);
      await criarAgendamento(admin, { pacienteId: heitor, reservaId: resGrupo, data: hoje, horaInicio: inicio, horaFim: fim }, criadaEm, db);
      pacienteCheckin = "Heitor Campos";
    }

    await adicionarNaEspera(admin, { pacienteId: pac.gabriela, profissionalId: helena, preferencia: "Terças à tarde, depois das 16h" }, db);
    await adicionarNaEspera(admin, { pacienteId: pac.fabio, preferencia: "Qualquer manhã" }, db);

    // O que o worker faria: concluir reservas passadas (lançamentos) e mandar os lembretes de amanhã.
    await withSistema(admin.tenantId, (tx) => concluirReservasPassadas(tx, agoraReal), db);
    await withSistema(admin.tenantId, (tx) => agendarLembretes(tx, agoraReal), db);
    await processarFila(admin.tenantId, new ConsoleProvider(), agoraReal, 20, db).catch(() => undefined);

    // Módulos ligados, prontuário (Helena em teste, Rafael pago pelo espaço), agenda online da Helena.
    await definirModulos(admin, { fiscal: true, agendaOnline: true, prontuario: true }, db);
    const ctxHelena: ContextoTenant = { tenantId: admin.tenantId, userId: ids.profissional, role: "profissional" };
    await ativarLicencaProntuario(ctxHelena, helena, agoraReal, db);
    await ativarLicencaProntuario(admin, rafael, agoraReal, db);
    const evolucao = await salvarRascunho(
      ctxHelena,
      {
        pacienteId: pac.carla,
        anotacoes: "Paciente relata melhora do sono e menos episódios de ansiedade. Mantida a frequência semanal.",
        prescricao: "Registro diário do humor até o próximo encontro.",
      },
      { agora: agoraReal, database: db },
    );
    await finalizarRegistro(ctxHelena, evolucao.id, { agora: agoraReal, database: db });
    await salvarRascunho(ctxHelena, { pacienteId: pac.carla, anotacoes: "Rascunho da sessão de hoje." }, { agora: agoraReal, database: db });
    const relatorio = await salvarRascunho(
      ctxHelena,
      {
        pacienteId: pac.carla,
        tipo: "documento",
        titulo: "Relatório clínico",
        anotacoes:
          "RELATÓRIO CLÍNICO\n\nPaciente em acompanhamento semanal desde fevereiro, com queixa inicial de insônia e ansiedade.\n\nEvolução: melhora do sono e redução das crises. Mantida a frequência semanal.",
        prescricao: "Recomenda-se a continuidade do acompanhamento.",
      },
      { agora: agoraReal, database: db },
    );
    await finalizarRegistro(ctxHelena, relatorio.id, { agora: agoraReal, database: db });
    const { slug: slugHelena } = await configurarAgendamentoOnline(
      admin,
      { profissionalId: helena, ativo: true, duracaoConsultaMin: 60, antecedenciaMinHoras: 2, janelaDias: 30, mensagemPublica: "Atendimento adulto. Chegue 10 minutos antes." },
      db,
    );

    // Fatura do mês do Salus (gateway simulado).
    await gerarFaturaDoMes(admin.tenantId, { agora: agoraReal, gateway: new GatewaySimulado(), database: db });

    // Superadmin da plataforma.
    await db.update(users).set({ role: "superadmin" }).where(eq(users.id, ids.superadmin));

    // Outro espaço, com a fatura vencida há mais de 15 dias: painel só para consulta.
    await criarTenantComAdmin(ids.atraso, { nomeTenant: "Clínica Bem Estar", documento: "45.723.174/0001-10" }, db);
    const [mAtraso] = await listarMembershipsDoUsuario(ids.atraso, db);
    const adminAtraso: ContextoTenant = { tenantId: mAtraso.tenantId, userId: ids.atraso, role: "admin" };
    await criarUnidade(adminAtraso, { nome: "Unidade Centro" }, db);
    await gerarFaturaDoMes(adminAtraso.tenantId, { agora: new Date(agoraReal.getTime() - 45 * 86_400_000), gateway: new GatewaySimulado(), database: db });

    const dados = { pacienteCheckin, carla: pac.carla, slugHelena, helena, rafael, paciente: pac.ana, hoje, amanha, competenciaAnterior: mesAnterior.slice(0, 7), atendimentoPago, linkPaciente, linkConvite: `/convite/${tokenConvite}`, unidade, c2 };
    writeFileSync(path.resolve("tests/manual/.dados.json"), JSON.stringify(dados, null, 2));
  } finally {
    await db.$client.end();
  }
}
