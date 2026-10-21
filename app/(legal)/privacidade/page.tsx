import type { Metadata } from "next";
import Link from "next/link";
import { controlador, versaoPorExtenso } from "@/src/legal/documentos";

export const metadata: Metadata = { title: "Política de Privacidade · Salus" };

export default function PrivacidadePage() {
  const c = controlador();
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-muted-foreground">Versão de {versaoPorExtenso()}.</p>

      <p>
        Esta política explica como o Salus trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018, LGPD). O
        Salus é operado por <strong>{c.nome}</strong>
        {c.cnpj && <>, CNPJ {c.cnpj}</>}
        {c.endereco && <>, {c.endereco}</>}.
      </p>

      <h2>1. Quem decide sobre cada dado</h2>
      <ul>
        <li>
          <strong>Dados da sua conta</strong> (nome, e-mail, senha cifrada, sessões, IP e registros de acesso): o Salus é o{" "}
          <em>controlador</em>.
        </li>
        <li>
          <strong>Dados que o espaço de saúde cadastra</strong> (pacientes, agendas, financeiro e prontuário): o espaço e os
          profissionais são os <em>controladores</em>, e o Salus é o <em>operador</em>, tratando esses dados só para prestar o serviço e
          conforme as instruções deles. Pacientes exercem seus direitos junto ao espaço ou ao profissional que os atende.
        </li>
      </ul>

      <h2>2. Dados tratados e finalidades</h2>
      <ul>
        <li>Conta e acesso: identificar você, manter a sessão, prevenir fraude e abuso (limites de tentativas, verificação anti-robô).</li>
        <li>Agenda e financeiro: reservar salas, agendar atendimentos, calcular cobranças e repasses e emitir notas fiscais.</li>
        <li>Pacientes: nome, contato, CPF e data de nascimento (opcionais) para agendamento e lembretes.</li>
        <li>
          Prontuário eletrônico: dados de saúde registrados pelo profissional, cifrados e acessíveis só ao autor ou a quem o paciente
          autorizar.
        </li>
        <li>Comunicação: e-mails de conta (confirmação, senha, convites) e lembretes por WhatsApp a quem consentiu.</li>
      </ul>

      <h2>3. Bases legais</h2>
      <ul>
        <li>Execução de contrato e procedimentos preliminares (art. 7º, V): conta, agenda e cobrança.</li>
        <li>Cumprimento de obrigação legal ou regulatória (art. 7º, II): notas fiscais, guarda do prontuário (CFM).</li>
        <li>Tutela da saúde, por profissional de saúde (art. 11, II, f): prontuário e dados de atendimento.</li>
        <li>Legítimo interesse (art. 7º, IX): segurança, prevenção a fraude e registros de acesso.</li>
        <li>Consentimento (art. 7º, I): lembretes por WhatsApp, revogável a qualquer momento pelo link da mensagem.</li>
      </ul>

      <h2>4. Compartilhamento</h2>
      <p>
        Não vendemos dados. Compartilhamos só o necessário com prestadores que operam partes do serviço: hospedagem e armazenamento de
        arquivos, envio de e-mail, verificação anti-robô (Cloudflare Turnstile), WhatsApp (Meta ou provedor conectado pelo espaço),
        cobrança (Asaas) e emissão de NFS-e (Focus NFe), quando o espaço usa essas funções. Alguns desses prestadores podem processar
        dados fora do Brasil, com as salvaguardas do art. 33 da LGPD.
      </p>

      <h2>5. Retenção</h2>
      <ul>
        <li>Conta: enquanto estiver ativa e pelo prazo legal de guarda de registros de acesso (Marco Civil da Internet: 6 meses).</li>
        <li>Dados fiscais e financeiros: pelo prazo legal (em regra, 5 anos).</li>
        <li>Prontuário: no mínimo 20 anos a partir do último registro (Lei 13.787/2018 e normas do CFM).</li>
        <li>Pacientes: até o espaço pedir a exclusão ou a anonimização, respeitados os prazos acima.</li>
      </ul>

      <h2>6. Segurança</h2>
      <p>
        Conexões por HTTPS, isolamento dos dados de cada espaço no banco, prontuário e anexos cifrados, trilha de auditoria de acessos e
        alterações, backups cifrados fora do servidor e acesso restrito por perfil.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir confirmação do tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários,
        portabilidade, informação sobre compartilhamentos e revogação do consentimento (art. 18). Titulares de conta falam com o
        encarregado abaixo; pacientes, com o espaço ou o profissional (o Salus ajuda o espaço a atender o pedido).
      </p>

      <h2>8. Encarregado (DPO)</h2>
      <p>
        {c.encarregadoNome ? `${c.encarregadoNome} · ` : ""}
        <a href={`mailto:${c.encarregadoEmail}`} className="text-primary underline-offset-4 hover:underline">
          {c.encarregadoEmail}
        </a>
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos só cookies necessários: o de sessão (para manter você conectado) e o da verificação anti-robô. Não usamos cookies de
        publicidade.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Mudanças relevantes geram uma nova versão desta política; você precisa aceitá-la no próximo acesso. Veja também os{" "}
        <Link href="/termos" className="text-primary underline-offset-4 hover:underline">
          Termos de Uso
        </Link>
        .
      </p>
    </>
  );
}
