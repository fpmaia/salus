"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

const FAQS = [
  {
    pergunta: "Como funciona o teste grátis de 15 dias do Prontuário Eletrônico?",
    resposta:
      "Na primeira ativação, cada profissional tem 15 dias grátis para usar evolução, prescrição e anexos. Depois do teste, quem ativou paga: se foi o administrador, a licença entra na fatura mensal do espaço (R$ 49,90 no Básico e no Pro, R$ 39,90 no Enterprise); se foi o próprio profissional, ele paga direto por PIX ou cartão, a cada 30 dias. Sem pagamento, os registros continuam disponíveis para leitura.",
  },
  {
    pergunta: "O que acontece se eu precisar de mais salas ou profissionais do que o limite?",
    resposta:
      "Diferente de sistemas que bloqueiam sua clínica quando você precisa cadastrar alguém de última hora, o Salus é flexível. Salas extras custam R$ 39,90/mês e profissionais adicionais R$ 19,90/mês. Eles são criados na hora e aparecem discriminados na fatura. A exceção é a unidade: o Básico tem uma só; para a segunda, é preciso o Pro.",
  },
  {
    pergunta: "Os profissionais sublocatários têm acesso a um painel próprio?",
    resposta:
      "Sim! Cada profissional recebe um link de convite com acesso seguro. Eles conseguem visualizar a grade das salas, suas próprias consultas marcadas, seu extrato financeiro detalhado de horas/locação e pagar as cobranças pendentes via PIX em poucos segundos pelo celular.",
  },
  {
    pergunta: "Como funciona a confirmação automática pelo WhatsApp?",
    resposta:
      "Você conecta o WhatsApp da sua clínica através de leitura de QR Code. O Salus envia lembretes automáticos com um link para o paciente confirmar ou cancelar. Não há cobrança por mensagem enviada — a integração é direta com seu número.",
  },
  {
    pergunta: "Posso gerenciar mais de uma clínica física na mesma conta?",
    resposta:
      "Sim. O Pro tem até 3 unidades e o Enterprise até 50 (unidades extras custam R$ 149/mês). Se você administra espaços separados (cada um com o próprio CNPJ), alterna entre eles com 1 clique no topo do painel.",
  },
  {
    pergunta: "Quais são as formas de pagamento da assinatura do Salus?",
    resposta:
      "A fatura do Salus é gerada no início de cada mês e vence no dia 10 (no primeiro mês, 3 dias depois de gerada), pelo Asaas: PIX, boleto ou cartão. Atrasou? Há 15 dias de carência com avisos; depois disso o espaço fica só para consulta até o pagamento, sem perder dados.",
  },
];

export function FaqSection() {
  const [aberto, setAberto] = useState<number | null>(0);

  return (
    <section id="faq" className="relative px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary uppercase tracking-wide">
            <HelpCircle className="size-3.5" /> Dúvidas Comuns
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Perguntas Frequentes
          </h2>
          <p className="text-sm text-muted-foreground">
            Tudo o que você precisa saber antes de modernizar a gestão do seu espaço.
          </p>
        </div>

        <div className="divide-y rounded-3xl border border-border/80 bg-card p-2 sm:p-4 shadow-sm">
          {FAQS.map((faq, idx) => {
            const estaAberto = aberto === idx;
            return (
              <div key={idx} className="py-2">
                <button
                  type="button"
                  onClick={() => setAberto(estaAberto ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left font-bold text-sm text-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <span>{faq.pergunta}</span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2 ${
                      estaAberto ? "rotate-180 text-primary" : ""
                    }`}
                  />
                </button>
                {estaAberto && (
                  <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed animate-in fade-in duration-200">
                    {faq.resposta}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
