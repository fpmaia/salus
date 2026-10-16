import { describe, expect, it } from "vitest";
import { descricaoDaNota, isoComFuso, montarDps, pendenciasDaConfiguracao, type ConfigFiscal } from "./fiscal";

const config: ConfigFiscal = {
  cnpjPrestador: "11222333000181",
  inscricaoMunicipal: "12345",
  codigoMunicipio: "3550308",
  opcaoSimplesNacional: 3,
  regimeTributarioSimplesNacional: 1,
  regimeEspecialTributacao: 0,
  codigoTributacaoNacional: "030301",
  codigoNbs: null,
  aliquotaIssBp: 200,
  serieDps: 1,
};

const nota = {
  numeroDps: 7,
  serieDps: 1,
  competencia: "2030-03-01",
  valorCentavos: 83500,
  descricao: "Cessão de uso de sala — competência 03/2030",
  tomador: { tipoDocumento: "cpf" as const, documento: "52998224725", nome: "Dra. Ana", email: "ana@x.dev" },
};

describe("NFS-e Nacional (DPS)", () => {
  it("formata data/hora com o deslocamento do fuso", () => {
    expect(isoComFuso(new Date("2030-04-02T12:34:56Z"), "America/Sao_Paulo")).toBe("2030-04-02T09:34:56-03:00");
    expect(isoComFuso(new Date("2030-04-02T12:34:56Z"), "UTC")).toBe("2030-04-02T12:34:56+00:00");
  });

  it("monta o payload da Focus NFe", () => {
    expect(montarDps(config, nota, new Date("2030-04-02T12:00:00Z"), "America/Sao_Paulo")).toEqual({
      data_emissao: "2030-04-02T09:00:00-03:00",
      serie_dps: 1,
      numero_dps: 7,
      data_competencia: "2030-03-31",
      emitente_dps: 1,
      codigo_municipio_emissora: 3550308,
      cnpj_prestador: "11222333000181",
      inscricao_municipal_prestador: "12345",
      codigo_opcao_simples_nacional: 3,
      regime_tributario_simples_nacional: 1,
      regime_especial_tributacao: 0,
      cpf_tomador: "52998224725",
      razao_social_tomador: "Dra. Ana",
      email_tomador: "ana@x.dev",
      codigo_municipio_prestacao: 3550308,
      codigo_tributacao_nacional_iss: "030301",
      descricao_servico: "Cessão de uso de sala — competência 03/2030",
      valor_servico: 835,
      tributacao_iss: 1,
      tipo_retencao_iss: 1,
      percentual_aliquota_relativa_municipio: 2,
    });
  });

  it("tomador pessoa jurídica usa cnpj_tomador; competência no mês corrente usa a data de hoje", () => {
    const dps = montarDps(
      { ...config, aliquotaIssBp: null, inscricaoMunicipal: null },
      { ...nota, competencia: "2030-04-01", tomador: { ...nota.tomador, tipoDocumento: "cnpj", documento: "11222333000181", email: null } },
      new Date("2030-04-15T12:00:00Z"),
      "America/Sao_Paulo",
    );
    expect(dps.cnpj_tomador).toBe("11222333000181");
    expect(dps.cpf_tomador).toBeUndefined();
    expect(dps.data_competencia).toBe("2030-04-15");
    expect(dps).not.toHaveProperty("percentual_aliquota_relativa_municipio");
    expect(dps).not.toHaveProperty("inscricao_municipal_prestador");
  });

  it("aponta pendências da configuração", () => {
    expect(pendenciasDaConfiguracao({ ...config, ambiente: "simulado", tokenConfigurado: false })).toEqual([]);
    expect(
      pendenciasDaConfiguracao({ ...config, cnpjPrestador: "", codigoMunicipio: "35", codigoTributacaoNacional: null, ambiente: "producao", tokenConfigurado: false }),
    ).toHaveLength(4);
  });

  it("descreve a competência", () => {
    expect(descricaoDaNota("Cessão de uso de sala", "2030-03-01")).toBe("Cessão de uso de sala — competência 03/2030");
  });
});
