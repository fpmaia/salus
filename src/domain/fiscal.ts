// NFS-e Nacional (DPS) da locação: validação da configuração e montagem do payload da
// Focus NFe (POST /v2/nfsen). Domínio puro: sem I/O.
import { ultimoDiaDaCompetencia } from "./financeiro";
import { partesLocais, type DataLocal } from "./tempo";

export type ConfigFiscal = {
  cnpjPrestador: string;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string | null;
  opcaoSimplesNacional: number;
  regimeTributarioSimplesNacional: number | null;
  regimeEspecialTributacao: number;
  codigoTributacaoNacional: string | null;
  codigoNbs: string | null;
  aliquotaIssBp: number | null;
  serieDps: number;
};

export type Tomador = { tipoDocumento: "cpf" | "cnpj"; documento: string; nome: string; email: string | null };

export type NotaParaEmitir = {
  numeroDps: number;
  serieDps: number;
  competencia: DataLocal;
  valorCentavos: number;
  descricao: string;
  tomador: Tomador;
};

/** Pendências que impedem emitir (mensagens para a tela de configuração). */
export function pendenciasDaConfiguracao(c: Partial<ConfigFiscal> & { tokenConfigurado: boolean; ambiente: string }): string[] {
  const p: string[] = [];
  if (!c.cnpjPrestador || c.cnpjPrestador.length !== 14) p.push("O espaço precisa ter CNPJ (o tenant foi cadastrado com CPF)");
  if (!c.codigoMunicipio || !/^\d{7}$/.test(c.codigoMunicipio)) p.push("Informe o código IBGE do município (7 dígitos)");
  if (!c.codigoTributacaoNacional || !/^\d{6}$/.test(c.codigoTributacaoNacional)) {
    p.push("Informe o código de tributação nacional do ISSQN (6 dígitos)");
  }
  if (c.codigoNbs && !/^\d{9}$/.test(c.codigoNbs)) p.push("O código NBS deve ter 9 dígitos");
  if (c.ambiente !== "simulado" && !c.tokenConfigurado) p.push("Informe o token da Focus NFe");
  return p;
}

/** Data/hora no fuso com deslocamento explícito: 2026-10-16T10:00:00-03:00. */
export function isoComFuso(instante: Date, timezone: string): string {
  const local = partesLocais(instante, timezone);
  const segundos = String(instante.getUTCSeconds()).padStart(2, "0");
  const comoUtc = Date.UTC(
    Number(local.data.slice(0, 4)),
    Number(local.data.slice(5, 7)) - 1,
    Number(local.data.slice(8, 10)),
    Math.floor(local.minutos / 60),
    local.minutos % 60,
    instante.getUTCSeconds(),
  );
  const deslocamento = Math.round((comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000);
  const sinal = deslocamento < 0 ? "-" : "+";
  const abs = Math.abs(deslocamento);
  return `${local.data}T${local.hora}:${segundos}${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Payload da DPS para a Focus NFe (NFS-e Nacional). O espaço é o prestador; o profissional,
 * o tomador. Competência: último dia do mês (limitado à data de emissão).
 */
export function montarDps(config: ConfigFiscal, nota: NotaParaEmitir, emissao: Date, timezone: string): Record<string, unknown> {
  const hoje = partesLocais(emissao, timezone).data;
  const fimDoMes = ultimoDiaDaCompetencia(nota.competencia);
  const dps: Record<string, unknown> = {
    data_emissao: isoComFuso(emissao, timezone),
    serie_dps: nota.serieDps,
    numero_dps: nota.numeroDps,
    data_competencia: fimDoMes < hoje ? fimDoMes : hoje,
    emitente_dps: 1,
    codigo_municipio_emissora: Number(config.codigoMunicipio),
    cnpj_prestador: config.cnpjPrestador,
    codigo_opcao_simples_nacional: config.opcaoSimplesNacional,
    regime_especial_tributacao: config.regimeEspecialTributacao,
    [nota.tomador.tipoDocumento === "cnpj" ? "cnpj_tomador" : "cpf_tomador"]: nota.tomador.documento,
    razao_social_tomador: nota.tomador.nome,
    codigo_municipio_prestacao: Number(config.codigoMunicipio),
    codigo_tributacao_nacional_iss: config.codigoTributacaoNacional,
    descricao_servico: nota.descricao,
    valor_servico: nota.valorCentavos / 100,
    tributacao_iss: 1, // operação tributável
    tipo_retencao_iss: 1, // não retido
  };
  if (config.inscricaoMunicipal) dps.inscricao_municipal_prestador = config.inscricaoMunicipal;
  if (config.regimeTributarioSimplesNacional) dps.regime_tributario_simples_nacional = config.regimeTributarioSimplesNacional;
  if (config.codigoNbs) dps.codigo_nbs = config.codigoNbs;
  if (config.aliquotaIssBp) dps.percentual_aliquota_relativa_municipio = config.aliquotaIssBp / 100;
  if (nota.tomador.email) dps.email_tomador = nota.tomador.email;
  return dps;
}

/** Descrição padrão: "Cessão de uso de sala — competência 10/2026". */
export function descricaoDaNota(base: string, competencia: DataLocal): string {
  return `${base} — competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}
