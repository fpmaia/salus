# salus
Proposta Técnica de Arquitetura: Salus – Gestão de Clínicas e Locação
1. Visão Geral do Produto (Salus)
O Salus é uma plataforma SaaS multi-tenant focada na gestão operacional, clínica e financeira de clínicas médicas e espaços de coworking de saúde. O sistema resolve a alocação de salas (tripla amarração: Sala + Profissional + Paciente), automatiza o comissionamento/cobrança e fornece um Prontuário Eletrónico Integrado para os profissionais de saúde.

2. Identidade Visual e Marca

Nome: Salus (remete à saúde, proteção e gestão premium).

Design: Logótipo minimalista com monograma em "S", simbolizando a organização de espaços (blocos) e a fluidez do tempo.

Paleta de Cores: Teal Escuro (ação/confiança), Verde Esmeralda (sucesso/financeiro) e fundos em Slate (redução de fadiga visual para secretariado).

3. Arquitetura Multi-Tenant e Expansão

Tenant (Clínica): Raiz do sistema, com faturação ao CNPJ/NIF ou CPF. Controla o plano_id (Básico, Pro, Enterprise).

Unidades (Subclínicas): Endereços físicos. A expansão de unidades gera oportunidades de upsell no SaaS.

Salas: Alocadas a unidades específicas.

Profissionais (Locatários): Vinculados ao Tenant, podendo atuar em múltiplas unidades da mesma clínica.

4. Gestão Clínica e Prontuário Eletrónico (Novo)
Para agregar valor direto ao médico locatário:

Registo Central de Pacientes: A secretária cadastra o paciente uma única vez na clínica (Tenant).

Prontuário / Evolução Clínica: Acesso restrito. Cada atendimento (agendamento) gera uma entrada no histórico do paciente.

Privacidade e Partilha: Configuração no Tenant para definir se o histórico do paciente é partilhado entre todos os profissionais da clínica ou estritamente isolado para o médico que realizou o atendimento.

5. Motor Financeiro e Regras de Negócio
Arquitetura de Ledger (Livro-Razão) baseada em eventos (triggers) a partir dos agendamentos:

Fluxo de Recebimento: Caixa Centralizado (paciente paga à clínica) ou Pagamento Direto (paciente paga ao médico).

Regras de Locação: Valor fixo por consulta, percentual do procedimento ou valor por turno.

Gestão de Faltas (No-Shows): Parametrização para isentar ou cobrar a taxa da sala em caso de ausência do paciente.

6. Stack Tecnológica e Segurança

Front-end: React/Next.js (App Router) + Tailwind CSS + Shadcn UI.

Back-end e Base de Dados: PostgreSQL com Supabase.

Segurança (RLS): Row Level Security nativo do Postgres. O tenant_id no JWT impede o cruzamento de dados entre clientes distintos do SaaS, blindando também os prontuários.

Prevenção de Duplo Agendamento: Constraint EXCLUDE USING gist nativa no PostgreSQL.

7. Modelo de Dados Principal (Core Schema Atualizado)

tenants, planos_saas, tenant_settings, unidades, salas.

profissionais (médicos/terapeutas) e acordos_financeiros.

pacientes (id, tenant_id, nome, documento, contactos).

agendamentos (id, tenant_id, sala_id, profissional_id, paciente_id, data_hora, status).

prontuarios_evolucoes (id, tenant_id, paciente_id, agendamento_id, profissional_id, anotacoes_clinicas, prescricoes, data_registo).

ledger_financeiro (extrato de faturas e repasses).
