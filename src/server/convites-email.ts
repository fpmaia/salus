import { mascararEmail } from "../observabilidade/log";
import { reportarErro } from "../observabilidade/monitoramento";
import { emailDoAmbiente, type MensagemEmail, type ProvedorEmail } from "./email";

/**
 * Envia o e-mail de um convite. Uma falha de envio não desfaz o convite: o link continua
 * disponível para copiar, e a tela avisa que o e-mail não saiu.
 */
export async function enviarEmailConvite(mensagem: MensagemEmail, provedor?: ProvedorEmail): Promise<boolean> {
  try {
    await (provedor ?? emailDoAmbiente()).enviar(mensagem);
    return true;
  } catch (erro) {
    reportarErro(erro, "convite não enviado por e-mail", { extra: { para: mascararEmail(mensagem.para) } });
    return false;
  }
}
