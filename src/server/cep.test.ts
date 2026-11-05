import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarCep, limparCacheCep } from "./cep";

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

describe("buscarCep", () => {
  beforeEach(() => limparCacheCep());

  it("usa a BrasilAPI e guarda em cache", async () => {
    const buscar = vi.fn(async () =>
      json({ cep: "01310100", state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Avenida Paulista" }),
    );
    const primeiro = await buscarCep("01310-100", buscar as unknown as typeof fetch);
    const segundo = await buscarCep("01310100", buscar as unknown as typeof fetch);
    expect(primeiro).toMatchObject({ logradouro: "Avenida Paulista", uf: "SP" });
    expect(segundo).toEqual(primeiro);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("cai para o ViaCEP quando a BrasilAPI falha", async () => {
    const buscar = vi.fn(async (url: string) =>
      url.includes("brasilapi")
        ? new Response("fora", { status: 503 })
        : json({ cep: "20040-020", logradouro: "Avenida Rio Branco", bairro: "Centro", localidade: "Rio de Janeiro", uf: "RJ" }),
    );
    expect(await buscarCep("20040020", buscar as unknown as typeof fetch)).toMatchObject({ cidade: "Rio de Janeiro" });
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("CEP inexistente devolve null", async () => {
    const buscar = vi.fn(async (url: string) => (url.includes("brasilapi") ? json({}, 404) : json({ erro: true })));
    expect(await buscarCep("99999999", buscar as unknown as typeof fetch)).toBeNull();
  });

  it("lança quando nenhum serviço responde", async () => {
    const buscar = vi.fn(async () => new Response("", { status: 500 }));
    await expect(buscarCep("01310100", buscar as unknown as typeof fetch)).rejects.toThrow();
  });

  it("ignora CEP incompleto sem consultar", async () => {
    const buscar = vi.fn();
    expect(await buscarCep("0131", buscar as unknown as typeof fetch)).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });
});
