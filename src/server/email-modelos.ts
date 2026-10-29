import type { MensagemEmail } from "./email";

// Modelos dos e-mails transacionais: HTML simples com estilos inline (clientes de e-mail
// ignoram CSS externo) e versão em texto. Todo dado variável é escapado.

const COR_PRIMARIA = "#0f5f63"; // teal escuro da marca

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function dataBr(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

type Conteudo = { para: string; assunto: string; saudacao: string; paragrafos: string[]; botao: { texto: string; url: string }; rodape: string };

function montar({ para, assunto, saudacao, paragrafos, botao, rodape }: Conteudo): MensagemEmail {
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:${COR_PRIMARIA};padding-bottom:16px">Salus</td></tr>
<tr><td style="font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">${escapar(saudacao)}</p>
${paragrafos.map((p) => `<p style="margin:0 0 12px">${escapar(p)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escapar(botao.url)}" style="display:inline-block;background:${COR_PRIMARIA};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapar(botao.texto)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#475569">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${escapar(botao.url)}</span></p>
</td></tr>
<tr><td style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px">${escapar(rodape)}</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [saudacao, "", ...paragrafos, "", `${botao.texto}: ${botao.url}`, "", rodape].join("\n");
  return { para, assunto, html, texto };
}

const RODAPE_CONTA = "Você recebeu este e-mail porque este endereço foi usado no Salus. Se não foi você, ignore esta mensagem.";

export function emailVerificacao(para: string, nome: string, url: string): MensagemEmail {
  return montar({
    para,
    assunto: "Confirme seu e-mail no Salus",
    saudacao: `Olá, ${nome}!`,
    paragrafos: ["Para ativar sua conta, confirme que este e-mail é seu. O link vale por 24 horas."],
    botao: { texto: "Confirmar e-mail", url },
    rodape: RODAPE_CONTA,
  });
}

export function emailRedefinirSenha(para: string, nome: string, url: string): MensagemEmail {
  return montar({
    para,
    assunto: "Redefinição de senha do Salus",
    saudacao: `Olá, ${nome}!`,
    paragrafos: [
      "Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora e só pode ser usado uma vez.",
      "Se você não pediu, ignore este e-mail: sua senha continua a mesma.",
    ],
    botao: { texto: "Definir nova senha", url },
    rodape: RODAPE_CONTA,
  });
}

export function emailConviteProfissional(para: string, dados: { nomeProfissional: string; espaco: string; url: string; expiraEm: Date }): MensagemEmail {
  return montar({
    para,
    assunto: `${dados.espaco} convidou você para o Salus`,
    saudacao: `Olá, ${dados.nomeProfissional}!`,
    paragrafos: [
      `${dados.espaco} usa o Salus para a reserva de salas e a agenda. Aceite o convite para reservar salas, ver sua agenda e seu extrato.`,
      `Crie a conta (ou entre) com este mesmo e-mail. O convite vale até ${dataBr(dados.expiraEm)}.`,
    ],
    botao: { texto: "Aceitar convite", url: dados.url },
    rodape: `Convite enviado por ${dados.espaco} pelo Salus.`,
  });
}

export function emailConviteEquipe(para: string, dados: { espaco: string; papel: string; url: string; expiraEm: Date }): MensagemEmail {
  return montar({
    para,
    assunto: `Convite para a equipe de ${dados.espaco} no Salus`,
    saudacao: "Olá!",
    paragrafos: [
      `Você foi convidado(a) para a equipe de ${dados.espaco} no Salus, com o perfil ${dados.papel}.`,
      `Crie a conta (ou entre) com este mesmo e-mail. O convite vale até ${dataBr(dados.expiraEm)}.`,
    ],
    botao: { texto: "Aceitar convite", url: dados.url },
    rodape: `Convite enviado por ${dados.espaco} pelo Salus.`,
  });
}

export function emailConviteClinica(para: string, dados: { plano: string; dias: number; url: string; expiraEm: Date }): MensagemEmail {
  return montar({
    para,
    assunto: `Seu teste grátis do Salus: ${dados.dias} dias no plano ${dados.plano}`,
    saudacao: "Olá!",
    paragrafos: [
      `A equipe Salus liberou para você ${dados.dias} dias de teste grátis no plano ${dados.plano}, com todos os módulos.`,
      "Crie a conta (ou entre) com este mesmo e-mail e cadastre o seu espaço pelo link. Durante o teste não há cobrança.",
      `O convite vale até ${dataBr(dados.expiraEm)}.`,
    ],
    botao: { texto: "Começar o teste grátis", url: dados.url },
    rodape: "Convite enviado pela equipe Salus.",
  });
}

export function emailConviteEquipePlataforma(para: string, dados: { papel: string; url: string; expiraEm: Date }): MensagemEmail {
  return montar({
    para,
    assunto: `Convite para a equipe da plataforma Salus (${dados.papel})`,
    saudacao: "Olá!",
    paragrafos: [
      `Você foi convidado para a equipe que administra a plataforma Salus, com o papel ${dados.papel}.`,
      "Entre (ou crie a conta) com este mesmo e-mail e aceite o convite na área da plataforma. Será pedida a verificação em duas etapas.",
      `O convite vale até ${dataBr(dados.expiraEm)}.`,
    ],
    botao: { texto: "Abrir a plataforma", url: dados.url },
    rodape: "Convite enviado pela equipe Salus.",
  });
}

/** Alerta operacional para a equipe técnica (sem dado pessoal: só ids e contagens). */
export function emailAlerta(para: string, dados: { chave: string; mensagem: string; detalhes: Record<string, unknown>; quando: Date }): MensagemEmail {
  const detalhes = JSON.stringify(dados.detalhes, null, 2);
  const texto = [
    `[Salus] ${dados.mensagem}`,
    "",
    `Alerta: ${dados.chave}`,
    `Quando: ${dados.quando.toISOString()}`,
    "",
    detalhes,
    "",
    "Próximo e-mail deste alerta em no mínimo 6 h. Veja o Sentry e os logs do worker.",
  ].join("\n");
  return {
    para,
    assunto: `[Salus] Alerta: ${dados.mensagem}`,
    texto,
    html: `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap">${escapar(texto)}</pre>`,
  };
}


export function emailDatasNaoReservadas(
  para: string,
  dados: { nome: string; espaco: string; datas: string[]; url: string },
): MensagemEmail {
  return montar({
    para,
    assunto: `Datas da sua reserva recorrente que não foram garantidas — ${dados.espaco}`,
    saudacao: `Olá, ${dados.nome}!`,
    paragrafos: [
      `Ao estender a sua reserva recorrente em ${dados.espaco}, estas datas não puderam ser reservadas porque a sala ou o seu horário já estava ocupado:`,
      ...dados.datas,
      "Fale com a recepção para escolher outra sala ou outro horário nessas datas.",
    ],
    botao: { texto: "Ver a agenda", url: dados.url },
    rodape: "Você recebeu este e-mail porque tem uma reserva recorrente neste espaço.",
  });
}

export function emailAssinaturaEmAtraso(
  para: string,
  dados: { espaco: string; vencimento: string; suspensaoEm: string; suspensa: boolean; url: string },
): MensagemEmail {
  return montar({
    para,
    assunto: dados.suspensa
      ? `${dados.espaco} está só para consulta no Salus: fatura em atraso`
      : `A fatura do Salus de ${dados.espaco} está em atraso`,
    saudacao: "Olá!",
    paragrafos: dados.suspensa
      ? [
          `A fatura do Salus que venceu em ${dados.vencimento} ainda não foi paga, então ${dados.espaco} ficou só para consulta: a equipe vê a agenda, os pacientes e o financeiro, mas não consegue marcar nem alterar nada, e o agendamento online fica fora do ar.`,
          "Os lembretes dos pacientes já marcados continuam saindo. Assim que o pagamento for confirmado, o espaço volta a funcionar sozinho.",
        ]
      : [
          `A fatura do Salus que venceu em ${dados.vencimento} ainda não foi paga.`,
          `Se não for paga até ${dados.suspensaoEm}, ${dados.espaco} fica só para consulta: ninguém consegue marcar nem alterar nada até o pagamento. Se já pagou, desconsidere este e-mail.`,
        ],
    botao: { texto: "Pagar a fatura", url: dados.url },
    rodape: "Você recebeu este e-mail porque administra este espaço no Salus.",
  });
}
