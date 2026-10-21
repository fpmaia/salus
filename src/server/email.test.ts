import { describe, expect, it } from "vitest";
import { EmailResend, ErroEmail } from "./email";
import { emailConviteEquipe, emailRedefinirSenha, emailVerificacao } from "./email-modelos";

describe("modelos de e-mail", () => {
  it("escapa dados variáveis no HTML e mantém o link no texto", () => {
    const m = emailVerificacao("ana@exemplo.com", '<script>alert("x")</script>', "https://app.exemplo.com/api/auth/verify-email?token=abc&x=1");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("token=abc&amp;x=1");
    expect(m.texto).toContain("https://app.exemplo.com/api/auth/verify-email?token=abc&x=1");
    expect(m.assunto).toBe("Confirme seu e-mail no Salus");
  });

  it("redefinição e convite levam o destinatário e a validade", () => {
    expect(emailRedefinirSenha("b@exemplo.com", "Bia", "https://x/r").para).toBe("b@exemplo.com");
    const convite = emailConviteEquipe("c@exemplo.com", { espaco: "Coworking Alfa", papel: "Recepção", url: "https://x/c", expiraEm: new Date("2030-03-10T12:00:00Z") });
    expect(convite.assunto).toContain("Coworking Alfa");
    expect(convite.texto).toContain("10/03/2030");
    expect(convite.texto).toContain("Recepção");
  });
});

describe("EmailResend", () => {
  const mensagem = { para: "a@exemplo.com", assunto: "Oi", html: "<p>oi</p>", texto: "oi" };

  it("envia pela API com a chave no cabeçalho", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ id: "1" }), { status: 200 });
    }) as unknown as typeof fetch;
    await new EmailResend("re_chave", "Salus <n@exemplo.com>", fetchFalso).enviar(mensagem);
    expect(chamadas[0].url).toBe("https://api.resend.com/emails");
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_chave");
    expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({ from: "Salus <n@exemplo.com>", to: ["a@exemplo.com"], subject: "Oi" });
  });

  it("falha com o status quando a API recusa", async () => {
    const fetchFalso = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch;
    await expect(new EmailResend("k", "f", fetchFalso).enviar(mensagem)).rejects.toThrow(ErroEmail);
  });
});
