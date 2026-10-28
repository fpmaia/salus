"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  HelpCircle,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Stethoscope,
  Users,
  Wallet,
  ExternalLink,
  Building2,
  FileSignature,
  KeyRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

type TopicoManual = {
  id: string;
  categoria: string;
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  tags: string[];
  linkDireto?: string;
  rotuloLink?: string;
  conteudo: React.ReactNode;
};

export function ManualConteudo() {
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("todas");

  const TOPICOS: TopicoManual[] = [
    // 1. PRIMEIROS PASSOS
    {
      id: "criando-espaco-unidades",
      categoria: "primeiros-passos",
      icone: Building2,
      titulo: "1. Criando sua Unidade e Cadastrando as Salas",
      descricao: "Como estruturar o espaço físico, horários de funcionamento e salas de atendimento.",
      tags: ["unidade", "sala", "espaço", "horário", "configuração", "endereço"],
      linkDireto: "/painel/unidades",
      rotuloLink: "Ir para Unidades e Salas",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            O primeiro passo para operar no Salus é registrar a sua unidade física e as salas disponíveis para atendimento clínico ou sublocação.
          </p>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <strong className="text-foreground block text-xs">Passo a Passo:</strong>
            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
              <li>Acesse o menu <strong>Unidades e Salas</strong> no painel de configurações.</li>
              <li>Clique em <strong>Nova Unidade</strong> e preencha nome, endereço completo, CNPJ e fuso horário.</li>
              <li>Dentro da unidade criada, cadastre cada <strong>Sala</strong> (ex: &ldquo;Consultório 01 - Geral&rdquo;, &ldquo;Sala 02 - Gineco&rdquo;, &ldquo;Sala 03 - Psicologia&rdquo;).</li>
              <li>Defina a cor de identificação da sala na grade e o horário de funcionamento padrão.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground block mb-0.5">Dica Pro de Ocupação:</strong>
              <span className="text-muted-foreground">
                Dê nomes descritivos às salas de acordo com os equipamentos disponíveis (ex: &ldquo;Sala com Maca Cirúrgica&rdquo; ou &ldquo;Sala com Divã&rdquo;). Isso evita que profissionais reservem salas incompatíveis com suas especialidades.
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "convidando-equipe",
      categoria: "primeiros-passos",
      icone: Users,
      titulo: "2. Convidando Profissionais e Equipe de Recepção",
      descricao: "Como convidar recepcionistas, administradores e profissionais de saúde com isolamento de permissões.",
      tags: ["equipe", "convite", "membros", "permissões", "recepção", "médicos", "psicólogos"],
      linkDireto: "/painel/profissionais",
      rotuloLink: "Ir para Profissionais",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            O Salus possui um sistema rigoroso de controle de acesso baseado em papéis (RBAC). Cada membro da equipe tem visão restrita ao que precisa para trabalhar.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <span className="font-bold text-foreground block text-xs">👑 Administrador</span>
              <p className="text-[11px] text-muted-foreground">
                Acesso total às finanças, relatórios, contratos, parametrizações e gestão de planos.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <span className="font-bold text-foreground block text-xs">🛎️ Recepção</span>
              <p className="text-[11px] text-muted-foreground">
                Visualiza e opera a grade de salas, lista de espera, confirmações de WhatsApp e check-in. Não vê prontuários nem extratos médicos.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <span className="font-bold text-foreground block text-xs">🩺 Profissional</span>
              <p className="text-[11px] text-muted-foreground">
                Vê apenas a sua própria agenda, pacientes atendidos por ele, seu prontuário criptografado e seu extrato financeiro para pagamento PIX.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-1.5 text-muted-foreground">
            <strong className="text-foreground block text-xs">Como convidar um profissional:</strong>
            <p>1. Acesse <strong>Profissionais</strong> &gt; <strong>Novo Profissional</strong>.</p>
            <p>2. Preencha Nome, Especialidade, E-mail e Registro Profissional (CRM/CRP/CRO).</p>
            <p>3. O profissional receberá um link seguro por e-mail para criar a senha e ativar seu perfil.</p>
          </div>
        </div>
      ),
    },

    // 2. AGENDA & RECEPÇÃO
    {
      id: "grade-salas-recepcao",
      categoria: "agenda-recepcao",
      icone: Calendar,
      titulo: "3. Operando a Grade de Salas & Check-in na Recepção",
      descricao: "Como acompanhar a chegada de pacientes, alternar status em 1 clique e evitar filas.",
      tags: ["agenda", "grade", "check-in", "consultas", "horários", "salas", "pacientes"],
      linkDireto: "/painel/agenda",
      rotuloLink: "Abrir Agenda de Salas",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            A tela de Agenda de Salas foi projetada para a recepção moderna. Toda a movimentação do dia fica visível em colunas por sala, com atualização em tempo real.
          </p>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <strong className="text-foreground block text-xs">Fluxo de Status do Paciente:</strong>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><span className="font-bold text-foreground">• Agendado:</span> Horário reservado pelo profissional ou recepção.</li>
              <li><span className="font-bold text-primary">• Confirmado:</span> Paciente respondeu &ldquo;SIM&rdquo; no WhatsApp ou confirmou por telefone.</li>
              <li><span className="font-bold text-emerald-600">• Chegou (Na Recepção):</span> A recepção clica em &ldquo;Check-in&rdquo;. O profissional recebe alerta na tela dele avisando que o paciente já está na sala de espera.</li>
              <li><span className="font-bold text-foreground">• Finalizado:</span> Consulta concluída. Horário liberado na sala.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 flex items-start gap-2.5">
            <Clock className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground block mb-0.5">Prevenção de Conflito de Horário:</strong>
              <span className="text-muted-foreground">
                O motor do Salus valida na base de dados (Postgres Range Constraints) qualquer sobreposição de segundos. É matematicamente impossível haver duas reservas na mesma sala no mesmo minuto.
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "lista-espera-inteligente",
      categoria: "agenda-recepcao",
      icone: Clock,
      titulo: "4. Lista de Espera Inteligente (Reocupação de Vagas)",
      descricao: "Como preencher automaticamente horários que foram desmarcados de última hora.",
      tags: ["lista de espera", "cancelamento", "encaixe", "ocupação", "vaga"],
      linkDireto: "/painel/espera",
      rotuloLink: "Ver Lista de Espera",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            Sala vazia é custo fixo sem receita. Quando um paciente desmarca uma consulta, a <strong>Lista de Espera Inteligente</strong> entra em ação.
          </p>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <strong className="text-foreground block text-xs">Como Funciona:</strong>
            <p className="text-muted-foreground">
              1. A recepção cadastra pacientes que gostariam de ser atendidos mais cedo caso surja desistência (especificando dias e períodos de preferência: manhã ou tarde).
            </p>
            <p className="text-muted-foreground">
              2. Ao cancelar um agendamento na grade, o Salus lista automaticamente os pacientes em espera compatíveis com aquele profissional e horário.
            </p>
            <p className="text-muted-foreground">
              3. Com um clique em &ldquo;Oferecer Vaga&rdquo;, o sistema dispara mensagem no WhatsApp para o paciente encaixar.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "whatsapp-oficial",
      categoria: "agenda-recepcao",
      icone: MessageSquare,
      titulo: "5. Lembretes e Confirmações pelo WhatsApp Oficial",
      descricao: "Conexão direta por QR Code, disparos automáticos e redução drástica de no-show.",
      tags: ["whatsapp", "lembrete", "confirmação", "no-show", "automação", "mensagens"],
      linkDireto: "/painel/notificacoes",
      rotuloLink: "Configurar WhatsApp",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            O Salus integra diretamente com a Evolution API via QR Code. Você usa o próprio número de WhatsApp da clínica sem depender de intermediários caros por mensagem.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <strong className="text-foreground block text-xs">Lembrete de 24 Horas:</strong>
              <p className="text-[11px] text-muted-foreground">
                Disparado no dia anterior às 09h da manhã solicitando confirmação do paciente. A resposta altera o status para &ldquo;Confirmado&rdquo; no painel da recepção.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <strong className="text-foreground block text-xs">Aviso de 2 Horas:</strong>
              <p className="text-[11px] text-muted-foreground">
                Lembrete de conveniência com o endereço da clínica e sala, reduzindo atrasos no trânsito.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // 3. CONTRATOS & COBRANÇA
    {
      id: "modelos-contrato",
      categoria: "contratos-financeiro",
      icone: FileSignature,
      titulo: "6. Modelos de Contrato de Sublocação & Parcerias",
      descricao: "Contratos por hora, por consulta, percentual ou mensalidade fixa gerando faturamento automático.",
      tags: ["contrato", "sublocação", "por hora", "porcentagem", "mensalidade", "financeiro", "pix"],
      linkDireto: "/painel/contratos",
      rotuloLink: "Ver Contratos",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            Cada profissional que atende na sua clínica pode ter um modelo comercial diferente. O Salus suporta os 4 modelos consagrados no mercado:
          </p>

          <div className="grid gap-2 text-xs">
            <div className="rounded-lg border bg-muted/20 p-2.5">
              <strong className="text-foreground block">1. Por Hora Reservada (Coworking Tradicional):</strong>
              <span className="text-muted-foreground">
                Multiplica as horas em que a sala esteve reservada pelo valor combinado (ex: 20h × R$ 45,00/h = R$ 900,00).
              </span>
            </div>

            <div className="rounded-lg border bg-muted/20 p-2.5">
              <strong className="text-foreground block">2. Por Consulta Realizada:</strong>
              <span className="text-muted-foreground">
                Valor fixo cobrado por cada atendimento efetivamente concluído (ex: R$ 30,00 por paciente atendido).
              </span>
            </div>

            <div className="rounded-lg border bg-muted/20 p-2.5">
              <strong className="text-foreground block">3. Percentual / Repasse:</strong>
              <span className="text-muted-foreground">
                A clínica retém uma porcentagem sobre o valor cobrado do paciente (ex: 30% da consulta fica com o espaço e 70% com o médico).
              </span>
            </div>

            <div className="rounded-lg border bg-muted/20 p-2.5">
              <strong className="text-foreground block">4. Mensalidade Fixa (Período Fechado):</strong>
              <span className="text-muted-foreground">
                Valor mensal fixo para turnos exclusivos (ex: R$ 1.800,00/mês para todas as manhãs de terça e quinta).
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-start gap-2.5">
            <Wallet className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground block mb-0.5">Baixa Automática no PIX:</strong>
              <span className="text-muted-foreground">
                No fechamento, o profissional recebe o QR Code PIX no próprio painel e por e-mail. Quando ele paga no aplicativo do banco, o Salus identifica via webhook do Asaas e quita o contrato em segundos.
              </span>
            </div>
          </div>
        </div>
      ),
    },

    // 4. PRONTUÁRIO ELETRÔNICO (EHR)
    {
      id: "prontuario-eletronico-ehr",
      categoria: "prontuario-ehr",
      icone: Stethoscope,
      titulo: "7. Prontuário Eletrônico Cifrado (CFM e LGPD)",
      descricao: "Ativação com 15 dias de teste grátis, sigilo médico estrito, adendos auditados e prescrições.",
      tags: ["prontuário", "ehr", "cfm", "lgpd", "criptografia", "adendo", "evolução", "receita", "anexos"],
      linkDireto: "/painel/prontuario",
      rotuloLink: "Acessar Prontuário",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            O módulo de Prontuário Eletrônico (EHR) do Salus foi construído sob as mais rigorosas diretrizes da Resolução CFM 1.821/07 e da LGPD.
          </p>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <strong className="text-foreground block text-xs">Principais Regras do Módulo:</strong>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">• 15 Dias de Degustação Gratuita:</strong> Cada profissional cadastrado pode ativar o prontuário e testar sem custos por 15 dias corridos.
              </li>
              <li>
                <strong className="text-foreground">• Sigilo Médico Inviolável:</strong> Apenas o profissional de saúde possui a chave que decifra os registros. Nem a recepção nem o dono do coworking conseguem ler as anotações clínicas.
              </li>
              <li>
                <strong className="text-foreground">• Imutabilidade e Adendos:</strong> Uma vez finalizado, o registro não pode ser apagado nem alterado. Qualquer correção médica deve ser feita via &ldquo;Adendo&rdquo;, mantendo a trilha histórica exigida pelo CFM.
              </li>
              <li>
                <strong className="text-foreground">• Anexos Seguros:</strong> Laudos, fotos de lesões e exames laboratoriais em PDF sobem com criptografia AES-256 e hash imutável.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
            <Shield className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground block mb-0.5">Compartilhamento Consentido:</strong>
              <span className="text-muted-foreground">
                Se dois profissionais da clínica atendem o mesmo paciente (ex: Psiquiatra e Psicólogo), eles podem compartilhar o prontuário mediante confirmação explícita de consentimento do paciente registrado no sistema.
              </span>
            </div>
          </div>
        </div>
      ),
    },

    // 5. PLANOS & OVERAGES
    {
      id: "planos-overages-saas",
      categoria: "planos-saas",
      icone: Zap,
      titulo: "8. Planos Salus, Limites e Overages Flexíveis",
      descricao: "Como funcionam as modalidades Básico, Pro e Enterprise e a cobrança de excedentes.",
      tags: ["planos", "preço", "overage", "salas extras", "profissionais extras", "básico", "pro", "enterprise"],
      linkDireto: "/painel/assinatura",
      rotuloLink: "Ver Minha Assinatura",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            O Salus adota o modelo de precificação híbrida para garantir previsibilidade e escalabilidade para o seu negócio.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <span className="font-bold text-foreground block text-xs">Plano Básico (R$ 199/mês)</span>
              <p className="text-[11px] text-muted-foreground">
                1 Unidade, até 5 salas e até 15 profissionais. Salas extras (+R$ 39,90) e profissionais extras (+R$ 19,90). 2ª unidade requer upgrade para o Pro.
              </p>
            </div>
            <div className="rounded-xl border-2 border-primary bg-card p-3 space-y-1 shadow-xs">
              <span className="font-bold text-primary block text-xs">Plano Pro (R$ 499/mês)</span>
              <p className="text-[11px] text-muted-foreground">
                Até 3 Unidades, até 20 salas e até 60 profissionais. Permite adicionar unidades extras (+R$ 149,00/mês).
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <span className="font-bold text-foreground block text-xs">Plano Enterprise (R$ 1.299/mês)</span>
              <p className="text-[11px] text-muted-foreground">
                Redes grandes: até 50 Unidades, 500 salas, 2.000 profissionais e Prontuário EHR com desconto (R$ 39,90/mês/prof).
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-1 text-muted-foreground">
            <strong className="text-foreground block text-xs">Ciclo de Faturamento da Assinatura:</strong>
            <p>• A fatura do Salus fecha no dia 1º de cada mês com vencimento no dia 10.</p>
            <p>• Salas e profissionais extras ativos no mês entram automaticamente discriminados na fatura.</p>
            <p>• Carência de 15 dias: mesmo se atrasar, o espaço continua com consultas marcadas garantidas.</p>
          </div>
        </div>
      ),
    },

    // 6. SEGURANÇA & LGPD
    {
      id: "seguranca-2fa-lgpd",
      categoria: "seguranca-lgpd",
      icone: KeyRound,
      titulo: "9. Autenticação 2FA, Backup e Direitos do Titular LGPD",
      descricao: "Configuração do aplicativo autenticador, trilhas de auditoria e anonimização de dados.",
      tags: ["segurança", "2fa", "autenticação", "dois fatores", "lgpd", "backup", "auditoria"],
      linkDireto: "/seguranca/dois-fatores",
      rotuloLink: "Configurar 2FA",
      conteudo: (
        <div className="space-y-4 text-xs text-foreground/90 leading-relaxed">
          <p>
            A segurança da informação é garantida em múltiplas camadas no Salus:
          </p>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <strong className="text-foreground block text-xs">Recursos de Segurança Disponíveis:</strong>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">• 2FA (Verificação em Duas Etapas):</strong> Compatível com Google Authenticator, Microsoft Authenticator e 1Password. Obrigatório para Superadmins e altamente recomendado para todos os administradores da clínica.
              </li>
              <li>
                <strong className="text-foreground">• Solicitação de Prontuário de Profissional Desligado:</strong> Caso um paciente ou ordem judicial solicite cópia de prontuário de um médico que não atende mais no espaço, o administrador pode abrir solicitação formal com justificativa. O acesso expira automaticamente em 1 hora.
              </li>
              <li>
                <strong className="text-foreground">• Direitos do Titular LGPD:</strong> Na ficha de cada paciente há ferramentas para exportação completa de dados em JSON e anonimização de dados pessoais mediante requerimento formal.
              </li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const categorias = [
    { id: "todas", rotulo: "Todos os Tópicos" },
    { id: "primeiros-passos", rotulo: "Primeiros Passos" },
    { id: "agenda-recepcao", rotulo: "Agenda & Recepção" },
    { id: "contratos-financeiro", rotulo: "Contratos & PIX" },
    { id: "prontuario-ehr", rotulo: "Prontuário EHR" },
    { id: "planos-saas", rotulo: "Planos & Overages" },
    { id: "seguranca-lgpd", rotulo: "Segurança & LGPD" },
  ];

  // Filtro inteligente por texto e categoria
  const topicosFiltrados = TOPICOS.filter((t) => {
    const atendeCategoria = categoriaAtiva === "todas" || t.categoria === categoriaAtiva;
    const termo = busca.toLowerCase().trim();
    const atendeBusca =
      !termo ||
      t.titulo.toLowerCase().includes(termo) ||
      t.descricao.toLowerCase().includes(termo) ||
      t.tags.some((tag) => tag.toLowerCase().includes(termo));
    return atendeCategoria && atendeBusca;
  });

  return (
    <div className="space-y-8">
      {/* Barra de Busca e Filtros */}
      <div className="space-y-4">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por funcionalidade (ex: prontuário, salas extras, contratos, PIX, WhatsApp, 2FA)..."
            className="w-full rounded-2xl border border-border/80 bg-card/80 backdrop-blur-md py-3.5 pl-12 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Abas de Categorias */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaAtiva(cat.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                categoriaAtiva === cat.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cat.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Tópicos do Manual */}
      {topicosFiltrados.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-12 text-center space-y-3">
          <HelpCircle className="size-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-bold text-foreground">Nenhum tópico encontrado</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Não encontramos resultados para &ldquo;{busca}&rdquo;. Tente buscar por outros termos como &ldquo;salas&rdquo;, &ldquo;prontuário&rdquo; ou &ldquo;contratos&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {topicosFiltrados.map((t) => {
            const Icone = t.icone;
            return (
              <div
                key={t.id}
                id={t.id}
                className="flex flex-col justify-between rounded-3xl border border-border/80 bg-card p-6 shadow-sm hover:border-primary/40 transition-all space-y-4"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-2xs">
                      <Icone className="size-5" />
                    </div>
                    {t.linkDireto && (
                      <Link
                        href={t.linkDireto}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors shadow-2xs"
                      >
                        {t.rotuloLink ?? "Acessar"} <ExternalLink className="size-3 text-muted-foreground" />
                      </Link>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">{t.titulo}</h3>
                    <p className="text-xs text-muted-foreground">{t.descricao}</p>
                  </div>

                  <div className="pt-2">{t.conteudo}</div>
                </div>

                <div className="flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
                  {t.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
