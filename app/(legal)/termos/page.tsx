import type { Metadata } from "next";
import Link from "next/link";
import { controlador, versaoPorExtenso } from "@/src/legal/documentos";

export const metadata: Metadata = { title: "Termos de Uso · Salus" };

export default function TermosPage() {
  const c = controlador();
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-muted-foreground">Versão de {versaoPorExtenso()}.</p>

      <p>
        Estes termos regem o uso do Salus, plataforma de gestão para espaços de saúde compartilhados, operada por{" "}
        <strong>{c.nome}</strong>
        {c.cnpj && <>, CNPJ {c.cnpj}</>}. Ao criar uma conta ou usar o serviço, você concorda com eles e com a{" "}
        <Link href="/privacidade" className="text-primary underline-offset-4 hover:underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>1. O serviço</h2>
      <p>
        O Salus oferece reserva de salas, agenda de pacientes, controle financeiro (cobranças, repasses e fechamento), lembretes,
        emissão de notas fiscais, cobrança por PIX/boleto e prontuário eletrônico, conforme o plano e os módulos contratados pelo espaço.
      </p>

      <h2>2. Contas</h2>
      <ul>
        <li>Cada pessoa usa a própria conta, com e-mail confirmado. Não compartilhe sua senha.</li>
        <li>O espaço (administrador) decide quem acessa e com qual perfil, e responde pelos acessos que concede.</li>
        <li>Avise-nos imediatamente sobre uso indevido da sua conta.</li>
      </ul>

      <h2>3. Responsabilidades do espaço e dos profissionais</h2>
      <ul>
        <li>
          São controladores dos dados de pacientes que cadastram: precisam de base legal para tratá-los e atender aos pedidos dos
          titulares.
        </li>
        <li>O conteúdo clínico é de responsabilidade do profissional que o registra, sob sigilo profissional.</li>
        <li>As regras de cobrança (acordos, cancelamentos, faltas) são definidas pelo espaço com os profissionais.</li>
      </ul>

      <h2>4. Uso aceitável</h2>
      <p>
        É proibido usar o Salus para fins ilícitos, enviar mensagens sem consentimento, tentar acessar dados de outros espaços, burlar
        limites técnicos ou sobrecarregar o serviço.
      </p>

      <h2>5. Planos, pagamento e suspensão</h2>
      <p>
        O espaço paga o plano contratado. Em caso de inadimplência ou violação destes termos, o acesso pode ser suspenso após aviso.
        Antes de encerrar uma conta, o espaço pode exportar seus dados.
      </p>

      <h2>6. Disponibilidade e backups</h2>
      <p>
        Trabalhamos para manter o serviço disponível e fazemos backups cifrados diários, mas podem ocorrer interrupções para manutenção
        ou por falhas de terceiros.
      </p>

      <h2>7. Encerramento e dados</h2>
      <p>
        Ao fim do contrato, os dados são devolvidos ou eliminados conforme instrução do espaço, exceto o que a lei exige guardar (por
        exemplo, o prontuário por 20 anos e os registros fiscais).
      </p>

      <h2>8. Responsabilidade</h2>
      <p>
        O Salus não substitui o julgamento profissional nem a orientação contábil ou jurídica do espaço. Na extensão permitida pela lei,
        nossa responsabilidade se limita aos valores pagos nos últimos 12 meses.
      </p>

      <h2>9. Alterações e foro</h2>
      <p>
        Mudanças relevantes geram nova versão destes termos, que precisa ser aceita no próximo acesso. Aplica-se a lei brasileira.
        Dúvidas:{" "}
        <a href={`mailto:${c.encarregadoEmail}`} className="text-primary underline-offset-4 hover:underline">
          {c.encarregadoEmail}
        </a>
        .
      </p>
    </>
  );
}
