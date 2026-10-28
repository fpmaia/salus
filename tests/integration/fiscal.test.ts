import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/client";
import { auditLog, configuracoesFiscais, notasFiscais } from "../../src/db/schema";
import { type ContextoTenant, withSistema, withTenant } from "../../src/db/tenant";
import { ErroNegocio } from "../../src/server/erros";
import { criarAcordo, fecharCompetencia } from "../../src/server/financeiro";
import {
  cancelarNota,
  emitirNota,
  emitirNotasDoMes,
  listarNotas,
  obterConfiguracaoFiscal,
  pendentesDeEmissao,
  processarNotasFiscais,
  salvarConfiguracaoFiscal,
  type FabricaEmissor,
} from "../../src/server/fiscal";
import { ErroComunicacaoFiscal, type EmissorNfse, type SituacaoNota } from "../../src/server/fiscal-provider";
import { definirModulos } from "../../src/server/modulos";
import { criarTenantComAdmin } from "../../src/server/onboarding";
import { atualizarProfissional, criarProfissional } from "../../src/server/profissionais";
import { concluirReservasPassadas, criarReserva } from "../../src/server/reservas";
import { criarSala, criarUnidade } from "../../src/server/unidades";
import { capturarErro, criarDbApp, criarUsuario } from "./helpers";

// NFS-e de locação via Focus NFe (NFS-e Nacional), com emissor falso controlado pelo teste.

const AGORA = new Date("2030-03-04T10:00:00Z");
const ABRIL = new Date("2030-04-02T12:00:00Z");

/** Emissor falso com estado: guarda o que recebeu e responde conforme o roteiro. */
class EmissorFalso implements EmissorNfse {
  recebidas = new Map<string, Record<string, unknown>>();
  emissoes = 0;
  falharRede = 0;
  recusar: string | null = null;
  autorizarNaConsulta = true;

  async emitir(ref: string, dps: Record<string, unknown>): Promise<SituacaoNota> {
    this.emissoes++;
    if (this.falharRede > 0) {
      this.falharRede--;
      // Simula a resposta perdida: a Focus recebeu, mas a conexão caiu antes de responder.
      this.recebidas.set(ref, dps);
      throw new ErroComunicacaoFiscal("timeout");
    }
    if (this.recusar) return { status: "erro", erros: [{ codigo: "E999", mensagem: this.recusar }] };
    this.recebidas.set(ref, dps);
    return { status: "processando" };
  }
  async consultar(ref: string): Promise<SituacaoNota> {
    if (!this.recebidas.has(ref)) return { status: "nao_encontrada" };
    if (!this.autorizarNaConsulta) return { status: "processando" };
    return {
      status: "autorizada",
      numero: String(this.recebidas.size),
      codigoVerificacao: "ABC",
      url: "https://www.nfse.gov.br/consultapublica/?chave=1",
      urlDanfse: "https://x/danfse.pdf",
      caminhoXml: "/x.xml",
      emitidaEm: ABRIL,
    };
  }
  async cancelar() {
    return { status: "cancelada" as const };
  }
}

let db: Database;
let admin: ContextoTenant;
let recepcao: ContextoTenant;
let ana: string;
let beto: string;
let emissor: EmissorFalso;
const fabrica: FabricaEmissor = () => emissor;
const opcoes = () => ({ agora: ABRIL, fabrica, database: db });

beforeAll(async () => {
  process.env.SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
  db = criarDbApp();
  emissor = new EmissorFalso();
  const adminId = await criarUsuario(db, "Admin Fiscal");
  const { tenantId } = await criarTenantComAdmin(adminId, { nomeTenant: "Coworking Fiscal", documento: "11.222.333/0001-81" }, db);
  admin = { tenantId, userId: adminId, role: "admin" };
  recepcao = { tenantId, userId: adminId, role: "recepcao" };
  await definirModulos(admin, { fiscal: true, agendaOnline: false, prontuario: false }, db);

  const { id: unidade } = await criarUnidade(admin, { nome: "Centro" }, db);
  const { id: sala } = await criarSala(admin, unidade, { nome: "Sala 1" }, db);
  ({ id: ana } = await criarProfissional(admin, { nome: "Dra. Ana", email: `ana.${randomUUID()}@teste.dev`, documento: "529.982.247-25" }, db));
  ({ id: beto } = await criarProfissional(admin, { nome: "Dr. Beto", email: `beto.${randomUUID()}@teste.dev` }, db));
  for (const p of [ana, beto]) {
    await criarAcordo(admin, { profissionalId: p, modelo: "hora", valorHoraCentavos: 5000, vigenteDe: "2030-01-01" }, db);
  }
  await criarReserva(admin, { salaId: sala, profissionalId: ana, data: "2030-03-05", horaInicio: "08:00", horaFim: "10:00" }, AGORA, db);
  await criarReserva(admin, { salaId: sala, profissionalId: beto, data: "2030-03-06", horaInicio: "08:00", horaFim: "09:00" }, AGORA, db);
  await withSistema(tenantId, (tx) => concluirReservasPassadas(tx, new Date("2030-03-10T00:00:00Z")), db);
});

afterAll(async () => {
  await db?.$client.end();
});

describe("configuração", () => {
  it("não ativa com pendências e guarda o token cifrado", async () => {
    const base = {
      ativo: true,
      ambiente: "homologacao" as const,
      opcaoSimplesNacional: 3,
      regimeTributarioSimplesNacional: null,
      regimeEspecialTributacao: 0,
      aliquotaIssBp: 200,
      descricaoServico: "Cessão de uso de sala",
      serieDps: 1,
      codigoMunicipio: "3550308",
    };
    await expect(salvarConfiguracaoFiscal(admin, base, db)).rejects.toThrow(/código de tributação|token/i);

    await salvarConfiguracaoFiscal(admin, { ...base, codigoTributacaoNacional: "030301", token: "token-secreto-focus" }, db);
    const [linha] = await withTenant(admin, (tx) => tx.select().from(configuracoesFiscais), db);
    expect(linha.tokenCifrado).toBeTruthy();
    expect(linha.tokenCifrado).not.toContain("token-secreto");
    const vista = await obterConfiguracaoFiscal(admin, db);
    expect(vista.config).not.toHaveProperty("tokenCifrado");
    expect(vista.config?.tokenConfigurado).toBe(true);
    expect(vista.pendencias).toEqual([]);
    const auditoria = await withTenant(admin, (tx) => tx.select().from(auditLog).where(eq(auditLog.acao, "fiscal.configurado")), db);
    expect(JSON.stringify(auditoria)).not.toContain("token-secreto");
  });
});

describe("emissão", () => {
  it("exige o mês fechado", async () => {
    await expect(emitirNota(admin, ana, "2030-03", opcoes())).rejects.toThrow("Feche o mês");
  });

  it("emite com o valor da locação do mês e acompanha até autorizar", async () => {
    await fecharCompetencia(admin, ana, "2030-03", ABRIL, db);
    emissor.autorizarNaConsulta = false;
    const { id, status } = await emitirNota(admin, ana, "2030-03", opcoes());
    expect(status).toBe("processando");

    const [nota] = await withTenant(admin, (tx) => tx.select().from(notasFiscais).where(eq(notasFiscais.id, id)), db);
    expect(nota).toMatchObject({ valorCentavos: 10000, numeroDps: 1, serieDps: 1, ambiente: "homologacao" });
    const dps = emissor.recebidas.get(nota.referencia)!;
    expect(dps).toMatchObject({ cnpj_prestador: "11222333000181", cpf_tomador: "52998224725", valor_servico: 100, numero_dps: 1 });

    emissor.autorizarNaConsulta = true;
    expect(await processarNotasFiscais(admin.tenantId, ABRIL, fabrica, db)).toEqual({ autorizada: 1 });
    const [autorizada] = await withTenant(admin, (tx) => tx.select().from(notasFiscais).where(eq(notasFiscais.id, id)), db);
    expect(autorizada).toMatchObject({ status: "autorizada", codigoVerificacao: "ABC", urlDanfse: "https://x/danfse.pdf" });
  });

  it("não emite duas notas ativas para o mesmo mês", async () => {
    await expect(emitirNota(admin, ana, "2030-03", opcoes())).rejects.toThrow("Já existe uma nota ativa");
  });

  it("exige CPF/CNPJ do tomador", async () => {
    await fecharCompetencia(admin, beto, "2030-03", ABRIL, db);
    await expect(emitirNota(admin, beto, "2030-03", opcoes())).rejects.toThrow("CPF ou CNPJ");
    expect((await pendentesDeEmissao(admin, "2030-03", db)).map((p) => p.nome)).toEqual(["Dr. Beto"]);
  });

  it("falha de rede não duplica: o reenvio consulta a referência antes", async () => {
    await atualizarProfissional(admin, beto, { nome: "Dr. Beto", email: (await emailDe(beto))!, documento: "11.444.777/0001-61", ativo: true }, db);
    emissor.falharRede = 1;
    const emissoesAntes = emissor.emissoes;
    const { id, status } = await emitirNota(admin, beto, "2030-03", opcoes());
    expect(status).toBe("pendente");

    expect(await processarNotasFiscais(admin.tenantId, ABRIL, fabrica, db)).toEqual({ autorizada: 1 });
    expect(emissor.emissoes - emissoesAntes).toBe(1); // a Focus recebeu uma única vez
    const [nota] = await withTenant(admin, (tx) => tx.select().from(notasFiscais).where(eq(notasFiscais.id, id)), db);
    expect(nota).toMatchObject({ status: "autorizada", numeroDps: 2 });
    expect(emissor.recebidas.get(nota.referencia)).toMatchObject({ cnpj_tomador: "11444777000161" });
  });

  it("recusa na pré-validação marca erro e libera nova emissão com outro número", async () => {
    const [nota] = await withTenant(admin, (tx) => tx.select().from(notasFiscais).where(eq(notasFiscais.profissionalId, beto)), db);
    await cancelarNota(admin, nota.id, "Emitida com dados incorretos do tomador", opcoes());
    emissor.recusar = "Código de tributação incompatível";
    const { status } = await emitirNota(admin, beto, "2030-03", opcoes());
    expect(status).toBe("erro");
    emissor.recusar = null;
    const segunda = await emitirNota(admin, beto, "2030-03", opcoes());
    const notas = await listarNotas(admin, "2030-03", db);
    const doBeto = notas.filter((n) => n.nota.profissionalId === beto).map((n) => [n.nota.status, n.nota.numeroDps]);
    expect(doBeto).toEqual(expect.arrayContaining([["cancelada", 2], ["erro", 3]]));
    expect(segunda.status).toBe("processando");
  });

  it("cancelamento exige justificativa e nota autorizada", async () => {
    const [nota] = await withTenant(admin, (tx) => tx.select().from(notasFiscais).where(eq(notasFiscais.profissionalId, ana)), db);
    await expect(cancelarNota(admin, nota.id, "curta", opcoes())).rejects.toThrow("15 caracteres");
    await cancelarNota(admin, nota.id, "Valor lançado em duplicidade no mês", opcoes());
    const erro = await capturarErro(cancelarNota(admin, nota.id, "Valor lançado em duplicidade no mês", opcoes()));
    expect(erro).toBeInstanceOf(ErroNegocio);
  });

  it("emitir em lote ignora quem já tem nota e informa o resultado", async () => {
    const resultado = await emitirNotasDoMes(admin, "2030-03", opcoes());
    expect(resultado).toEqual([{ nome: "Dra. Ana", ok: true, mensagem: "processando" }]);
  });

  it("recepção vê as notas mas não emite", async () => {
    expect((await listarNotas(recepcao, "2030-03", db)).length).toBeGreaterThan(0);
    const erro = await capturarErro(emitirNota(recepcao, ana, "2030-03", opcoes()));
    expect((erro as Error).name).toBe("ErroPermissao");
  });
});

async function emailDe(profissionalId: string) {
  const { profissionais } = await import("../../src/db/schema");
  const [p] = await withTenant(admin, (tx) => tx.select({ email: profissionais.email }).from(profissionais).where(eq(profissionais.id, profissionalId)), db);
  return p?.email;
}
