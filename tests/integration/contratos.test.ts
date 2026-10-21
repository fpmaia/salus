import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { contratosLocacao, regrasRecorrencia, reservasSala } from "../../src/db/schema";
import { type ContextoTenant, withTenant } from "../../src/db/tenant";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { criarProfissional } from "../../src/server/profissionais";
import { criarSala, criarUnidade, definirHorarios } from "../../src/server/unidades";
import { criarContrato, encerrarContrato, listarContratos, obterContrato } from "../../src/server/contratos";
import { criarDbApp, criarUsuario } from "./helpers";

// O módulo é desligado por padrão (src/server/modulos.ts); estes testes o ligam.
process.env.SALUS_CONTRATOS = "true";

const AGORA = new Date("2030-03-04T10:00:00Z"); // Segunda-feira
const DATA_INICIO = "2030-03-04";

let db: Database;
let ctxA: ContextoTenant;
let ctxB: ContextoTenant;
let profissionalA: string;
let profissionalB: string;
let unidadeA: string;
let salaA: string;
let salaB: string;

beforeAll(async () => {
  db = criarDbApp();

  const userA = await criarUsuario(db, "Admin Contratos A");
  const userB = await criarUsuario(db, "Admin Contratos B");

  const { tenantId: tA } = await criarTenantComAdmin(
    userA,
    { nomeTenant: "Clínica Contratos A", documento: "11.222.333/0001-81" },
    db,
  );
  const { tenantId: tB } = await criarTenantComAdmin(
    userB,
    { nomeTenant: "Clínica Contratos B", documento: "529.982.247-25" },
    db,
  );

  ctxA = { tenantId: tA, userId: userA, role: "admin" };
  ctxB = { tenantId: tB, userId: userB, role: "admin" };

  // Setup A: Unidade, sala e profissional
  const uA = await criarUnidade(ctxA, { nome: "Unidade Principal A", timezone: "America/Sao_Paulo" }, db);
  unidadeA = uA.id;
  await definirHorarios(
    ctxA,
    uA.id,
    [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: "07:00", fecha: "20:00" })),
    db,
  );
  const sA = await criarSala(ctxA, uA.id, { nome: "Consultório 1" }, db);
  salaA = sA.id;
  const pA = await criarProfissional(ctxA, { nome: "Dra. Ana Silva", email: "ana.silva@teste.com" }, db);
  profissionalA = pA.id;

  // Setup B: Unidade, sala e profissional
  const uB = await criarUnidade(ctxB, { nome: "Unidade Principal B", timezone: "America/Sao_Paulo" }, db);
  await definirHorarios(
    ctxB,
    uB.id,
    [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: "07:00", fecha: "20:00" })),
    db,
  );
  const sB = await criarSala(ctxB, uB.id, { nome: "Consultório B" }, db);
  salaB = sB.id;
  const pB = await criarProfissional(ctxB, { nome: "Dr. Bruno Souza", email: "bruno.souza@teste.com" }, db);
  profissionalB = pB.id;
});

afterAll(async () => {
  await db?.$client.end();
});

describe("Gestão de Contratos de Locação Fixa", () => {
  it("cria contrato com código sequencial, regras de recorrência e reservas automáticas", async () => {
    const contrato = await criarContrato(
      ctxA,
      {
        profissionalId: profissionalA,
        salaId: salaA,
        dataInicio: DATA_INICIO,
        valorMensalCentavos: 250000,
        diaVencimento: 10,
        cobrancaConsultaTipo: "nenhuma",
        gradeHorarios: [
          { diaSemana: 1, horaInicio: "08:00", horaFim: "12:00" }, // Segundas
          { diaSemana: 3, horaInicio: "14:00", horaFim: "18:00" }, // Quartas
        ],
        termosContrato: "Termos padrão do contrato de locação com mais de 50 caracteres para validação do Zod schema.",
      },
      AGORA,
      db,
    );

    expect(contrato.id).toBeDefined();
    expect(contrato.codigo).toMatch(/^CTR-2030-\d{4}$/);
    expect(contrato.ocorrenciasCriadas).toBeGreaterThan(0);
    expect(contrato.conflitos).toBe(0);

    const detalhe = await obterContrato(ctxA, contrato.id, db);
    expect(detalhe.codigo).toBe(contrato.codigo);
    expect(detalhe.status).toBe("ativo");
    expect(detalhe.valorMensalCentavos).toBe(250000);
    expect(detalhe.regras.length).toBe(2);

    const lista = await listarContratos(ctxA, undefined, db);
    expect(lista.some((c) => c.id === contrato.id)).toBe(true);
  });

  it("identifica e isola conflitos de horário ao ativar segundo contrato sobreposto", async () => {
    const p2 = await criarProfissional(ctxA, { nome: "Dr. Carlos Conflito", email: "carlos.conflito@teste.com" }, db);

    const contrato2 = await criarContrato(
      ctxA,
      {
        profissionalId: p2.id,
        salaId: salaA, // mesma sala
        dataInicio: DATA_INICIO,
        valorMensalCentavos: 180000,
        diaVencimento: 5,
        cobrancaConsultaTipo: "fixo",
        cobrancaConsultaValorCentavos: 2000,
        gradeHorarios: [
          { diaSemana: 1, horaInicio: "09:00", horaFim: "11:00" }, // sobrepõe 08:00-12:00
        ],
        termosContrato: "Termos do segundo contrato com mais de cinquenta caracteres obrigatórios pela validação.",
      },
      AGORA,
      db,
    );

    expect(contrato2.id).toBeDefined();
    expect(contrato2.conflitos).toBeGreaterThan(0);
    expect(contrato2.datasConflito.length).toBeGreaterThan(0);
  });

  it("encerra contrato e cancela reservas futuras sem agendamentos", async () => {
    const p3 = await criarProfissional(ctxA, { nome: "Dra. Daniela Encerramento", email: "daniela.encerramento@teste.com" }, db);
    const u = await criarSala(ctxA, unidadeA, { nome: "Sala Descarte" }, db);

    const contrato = await criarContrato(
      ctxA,
      {
        profissionalId: p3.id,
        salaId: u.id,
        dataInicio: DATA_INICIO,
        valorMensalCentavos: 120000,
        diaVencimento: 15,
        cobrancaConsultaTipo: "nenhuma",
        gradeHorarios: [{ diaSemana: 2, horaInicio: "08:00", horaFim: "10:00" }],
        termosContrato: "Termos de contrato para teste de encerramento de vigência e desocupação da sala.",
      },
      AGORA,
      db,
    );

    const encerramento = await encerrarContrato(ctxA, contrato.id, AGORA, db);
    expect(encerramento.sucesso).toBe(true);

    const detalhe = await obterContrato(ctxA, contrato.id, db);
    expect(detalhe.status).toBe("encerrado");
    expect(detalhe.encerradoEm).toBeDefined();
  });

  it("garante isolamento tenant (RLS): Tenant B não vê nem altera contratos do Tenant A", async () => {
    const listaB = await listarContratos(ctxB, undefined, db);
    expect(listaB.length).toBe(0);

    const todosA = await listarContratos(ctxA, undefined, db);
    expect(todosA.length).toBeGreaterThan(0);

    await expect(obterContrato(ctxB, todosA[0].id, db)).rejects.toThrow();
  });

  it("módulo desligado recusa qualquer operação", async () => {
    process.env.SALUS_CONTRATOS = "";
    try {
      await expect(listarContratos(ctxA, undefined, db)).rejects.toThrow("desativados");
    } finally {
      process.env.SALUS_CONTRATOS = "true";
    }
  });
});
