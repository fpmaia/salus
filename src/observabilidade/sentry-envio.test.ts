import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";
import * as Sentry from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { descarregarMonitoramento, iniciarMonitoramento, reportarAlerta, reportarErro } from "./monitoramento";

// O que realmente sai do processo para o Sentry: um "Sentry" falso local recebe os envelopes.

let servidor: Server;
const recebidos: string[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => {
      const corpo = Buffer.concat(partes);
      recebidos.push((req.headers["content-encoding"] === "gzip" ? gunzipSync(corpo) : corpo).toString("utf-8"));
      res.writeHead(200).end("{}");
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const { port } = servidor.address() as AddressInfo;
  vi.stubEnv("SENTRY_DSN", `http://chavepublica@127.0.0.1:${port}/1`);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  iniciarMonitoramento("worker");
});

afterAll(async () => {
  await Sentry.close(1000);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await new Promise((ok) => servidor.close(ok));
});

describe("envio ao Sentry", () => {
  it("leva o erro com tags e sem dado pessoal; o alerta vai como aviso agrupado", async () => {
    Sentry.setUser({ id: "user-1", email: "maria@exemplo.com", ip_address: "1.2.3.4" });
    Sentry.addBreadcrumb({ message: "paciente Maria Souza" });
    reportarErro(new Error("falha ao gravar"), "job falhou", { tags: { fila: "notificacoes.enviar", tenantId: "t-1" } });
    reportarAlerta("outbox.atrasada", "Lembretes parados", { extra: { espacos: 1 } });
    await descarregarMonitoramento();

    const tudo = recebidos.join("\n");
    expect(tudo).toContain("falha ao gravar");
    expect(tudo).toContain("notificacoes.enviar");
    expect(tudo).toContain('"servico":"worker"');
    expect(tudo).toContain("Lembretes parados");
    expect(tudo).toContain('"level":"warning"');
    expect(tudo).not.toContain("maria@exemplo.com");
    expect(tudo).not.toContain("1.2.3.4");
    expect(tudo).not.toContain("Maria Souza");
  });
});
