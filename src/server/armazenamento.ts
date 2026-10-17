import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Armazenamento de objetos compatível com S3 (SeaweedFS em dev/VPS; S3/R2 em produção).
// Os arquivos chegam aqui já cifrados pela aplicação.

export interface ArmazenamentoObjetos {
  enviar(chave: string, dados: Buffer): Promise<void>;
  obter(chave: string): Promise<Buffer>;
}

export class ErroArmazenamento extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroArmazenamento";
  }
}

export class ArmazenamentoS3 implements ArmazenamentoObjetos {
  private readonly cliente: S3Client;
  constructor(
    private readonly bucket: string,
    config: { endpoint?: string; regiao: string; accessKeyId: string; secretAccessKey: string; pathStyle: boolean },
  ) {
    this.cliente = new S3Client({
      endpoint: config.endpoint,
      region: config.regiao,
      forcePathStyle: config.pathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private bucketPronto: Promise<void> | null = null;

  /** Cria o bucket se ainda não existir (primeira subida em dev/VPS). */
  private garantirBucket() {
    this.bucketPronto ??= (async () => {
      try {
        await this.cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await this.cliente.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    })().catch((erro) => {
      this.bucketPronto = null;
      throw erro;
    });
    return this.bucketPronto;
  }

  async enviar(chave: string, dados: Buffer) {
    try {
      await this.garantirBucket();
      await this.cliente.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: chave, Body: dados, ContentType: "application/octet-stream" }),
      );
    } catch (erro) {
      throw new ErroArmazenamento(`Falha ao enviar o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  async obter(chave: string) {
    try {
      const resposta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
      return Buffer.from(await resposta.Body!.transformToByteArray());
    } catch (erro) {
      throw new ErroArmazenamento(`Falha ao ler o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
}

/** Em memória: testes. */
export class ArmazenamentoMemoria implements ArmazenamentoObjetos {
  readonly objetos = new Map<string, Buffer>();
  async enviar(chave: string, dados: Buffer) {
    this.objetos.set(chave, Buffer.from(dados));
  }
  async obter(chave: string) {
    const dados = this.objetos.get(chave);
    if (!dados) throw new ErroArmazenamento("Arquivo não encontrado");
    return dados;
  }
}

const globalArmazenamento = globalThis as unknown as { salusArmazenamento?: ArmazenamentoObjetos };

/** Configurado por S3_* (ver .env.example). */
export function armazenamentoDoAmbiente(): ArmazenamentoObjetos {
  if (globalArmazenamento.salusArmazenamento) return globalArmazenamento.salusArmazenamento;
  const { S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT, S3_REGIAO, S3_PATH_STYLE } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new ErroArmazenamento("Armazenamento de anexos não configurado (S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)");
  }
  globalArmazenamento.salusArmazenamento = new ArmazenamentoS3(S3_BUCKET, {
    endpoint: S3_ENDPOINT || undefined,
    regiao: S3_REGIAO || "us-east-1",
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
    pathStyle: S3_PATH_STYLE !== "false",
  });
  return globalArmazenamento.salusArmazenamento;
}
