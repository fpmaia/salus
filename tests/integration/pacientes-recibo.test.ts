import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { memberships, pacientes, profissionais } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { alterarStatusAgendamento, criarAgendamento } from "../../src/server/agendamentos";
import { definirValorAgendamento } from "../../src/server/financeiro";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarPaciente, criarPaciente, obterPaciente } from "../../src/server/pacientes";
import { criarProfissional } from "../../src/server/profissionais";
import { dadosDoRecibo } from "../../src/server/recibos";
import { anonimizarPaciente, exportarDadosPaciente } from "../../src/server/titular";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { criarDbApp, criarUsuario } from "./helpers";

// Cadastro do paciente (responsável legal, convênio, endereço) e recibo do atendimento.

const AGORA = new Date("2030-03-04T10:00:00Z"); // segunda, 07:00 em São Paulo
const DEPOIS = new Date("2030-03-05T13:30:00Z"); // durante o atendimento de terça

let db: Database;
let admin: ContextoTenant;
let beto: ContextoTenant;
let anaId: string;
let sala: string;

beforeAll(async () => {
  db = criarDbApp();
  const adminId = await criarUsuario(db, "Admin Recibo");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Recibo", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  ({ id: anaId } = await criarProfissional(
    admin,
    { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev`, conselho: "CRP", registro: "06/12345", especialidade: "Psicologia", documento: "529.982.247-25" },
    db,
  ));
  const { id: betoId } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db);
  const betoUser = await criarUsuario(db, "Beto Recibo");
  await withTenant(
    admin,
    async (tx) => {
      const [m] = await tx.insert(memberships).values({ userId: betoUser, role: "profissional" }).returning({ id: memberships.id });
      await tx.update(profissionais).set({ membershipId: m.id }).where(eq(profissionais.id, betoId));
    },
    db,
  );
  beto = { tenantId, userId: betoUser, role: "profissional" };
  const { id: unidadeId } = await criarUnidade(admin, { nome: "Centro", endereco: "Rua das Flores, 100" }, db);
  ({ id: sala } = await criarSala(admin, unidadeId, { nome: "Sala 1" }, db));
});

afterAll(async () => {
  await db?.$client.end();
});

const completo = {
  nome: "Pedro Menor",
  dataNascimento: "2020-05-10",
  responsavelNome: "Maria Mãe",
  responsavelCpf: "111.444.777-35",
  responsavelParentesco: "Mãe",
  convenioNome: "Saúde Mais",
  convenioCarteirinha: "123456",
  cep: "01310-100",
  endereco: "Av. Paulista, 1000, ap. 12",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "sp",
};

describe("cadastro do paciente", () => {
  let pedro: string;

  it("grava responsável, convênio e endereço (CEP e CPF só dígitos, UF maiúscula)", async () => {
    ({ id: pedro } = await criarPaciente(admin, completo, AGORA, db));
    const { paciente } = (await obterPaciente(admin, pedro, db))!;
    expect(paciente).toMatchObject({ responsavelCpf: "11144477735", cep: "01310100", uf: "SP", convenioNome: "Saúde Mais", responsavelParentesco: "Mãe" });
  });

  it("menor de idade exige responsável; dados inválidos são recusados", async () => {
    await expect(criarPaciente(admin, { nome: "Sem Responsável", dataNascimento: "2020-01-01" }, AGORA, db)).rejects.toThrow("responsável legal");
    await expect(criarPaciente(admin, { nome: "Adulto", dataNascimento: "2000-01-01" }, AGORA, db)).resolves.toBeTruthy();
    await expect(criarPaciente(admin, { ...completo, nome: "X CEP", cep: "123" }, AGORA, db)).rejects.toThrow("CEP inválido");
    await expect(criarPaciente(admin, { ...completo, nome: "X UF", uf: "XX" }, AGORA, db)).rejects.toThrow("UF inválida");
    await expect(criarPaciente(admin, { ...completo, nome: "X CPF", responsavelCpf: "123.456.789-00" }, AGORA, db)).rejects.toThrow("CPF do responsável");
    await expect(atualizarPaciente(admin, pedro, { ...completo, responsavelNome: "", ativo: true }, AGORA, db)).rejects.toThrow("responsável legal");
  });

  it("LGPD: a exportação traz os novos dados e a anonimização apaga todos", async () => {
    const exportado = await exportarDadosPaciente(admin, pedro, AGORA, db);
    expect(exportado.paciente).toMatchObject({
      responsavel: { nome: "Maria Mãe", cpf: "11144477735" },
      convenio: { nome: "Saúde Mais", carteirinha: "123456" },
      endereco: { cidade: "São Paulo", uf: "SP", cep: "01310100" },
    });
    await anonimizarPaciente(admin, pedro, { justificativa: "Pedido do responsável por e-mail" }, AGORA, db);
    const [depois] = await withTenant(admin, (tx) => tx.select().from(pacientes).where(eq(pacientes.id, pedro)), db);
    expect(depois).toMatchObject({ responsavelNome: null, responsavelCpf: null, convenioNome: null, endereco: null, cep: null, cidade: null, uf: null });
  });
});

describe("recibo", () => {
  let consulta: string;
  let joao: string;

  it("só para atendimento realizado com valor", async () => {
    ({ id: joao } = await criarPaciente(admin, { ...completo, nome: "João Menor" }, AGORA, db));
    ({ id: consulta } = await criarAgendamento(admin, { pacienteId: joao, profissionalId: anaId, salaId: sala, data: "2030-03-05", horaInicio: "10:00", horaFim: "11:00" }, AGORA, db));
    await expect(dadosDoRecibo(admin, consulta, db)).rejects.toThrow("atendimento realizado");
    await alterarStatusAgendamento(admin, consulta, "presente", null, DEPOIS, db);
    await alterarStatusAgendamento(admin, consulta, "realizado", null, DEPOIS, db);
    await expect(dadosDoRecibo(admin, consulta, db)).rejects.toThrow("valor registrado");
    await definirValorAgendamento(admin, consulta, 15030, DEPOIS, db);
  });

  it("em nome do responsável, com o valor por extenso e os dados do profissional", async () => {
    const r = await dadosDoRecibo(admin, consulta, db);
    expect(r).toMatchObject({
      valorCentavos: 15030,
      valorPorExtenso: "cento e cinquenta reais e trinta centavos",
      pagador: { nome: "Maria Mãe", cpf: "11144477735", parentesco: "Mãe" },
      paciente: { nome: "João Menor" },
      profissional: { nome: "Dra. Ana", conselho: "CRP", registro: "06/12345", documento: "52998224725" },
      data: "2030-03-05",
      hora: "10:00",
      local: { unidade: "Centro", endereco: "Rua das Flores, 100" },
      recebidoPeloEspaco: false,
    });
    expect(r.numero).toMatch(/^2030-[0-9A-F]{8}$/);
  });

  it("outro profissional não emite o recibo", async () => {
    await expect(dadosDoRecibo(beto, consulta, db)).rejects.toThrow("não encontrado");
  });
});
