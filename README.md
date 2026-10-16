# Salus

Plataforma SaaS multi-tenant para **gestão de coworkings de saúde**: locação de salas para profissionais autônomos, agenda de pacientes e controle financeiro de cobranças e repasses.

> Plano detalhado (decisões, modelo de dados, fases e critérios de pronto): [docs/plano-desenvolvimento.md](docs/plano-desenvolvimento.md)

## 1. Visão geral

O Salus resolve o dia a dia de quem administra espaços de saúde compartilhados:

- **Salas:** profissionais reservam salas por período, de forma avulsa ou recorrente, sem conflito de horário.
- **Agenda:** pacientes são agendados dentro das reservas do profissional, com confirmação por WhatsApp.
- **Financeiro:** o sistema calcula automaticamente o que cada profissional deve ao espaço (ou o repasse que recebe), gera o fechamento mensal e o extrato.

Mercado inicial: **Brasil** (LGPD, CPF/CNPJ).

## 2. Identidade visual

- **Nome:** Salus (saúde, proteção e gestão premium).
- **Logo:** monograma minimalista em "S", que remete à organização de espaços (blocos) e à fluidez do tempo.
- **Paleta:** teal escuro (ação/confiança), verde-esmeralda (sucesso/financeiro) e fundos slate (menos fadiga visual para a recepção).

## 3. Estrutura multi-tenant

- **Tenant (coworking/clínica):** raiz do sistema, faturado por CNPJ ou CPF; possui um plano SaaS (Básico, Pro, Enterprise).
- **Unidades:** endereços físicos, cada uma com fuso horário, horário de funcionamento e feriados. Novas unidades são oportunidade de upsell.
- **Salas:** pertencem a uma unidade e têm recursos (maca, pia, equipamentos).
- **Profissionais (locatários):** vinculados ao tenant, podendo atuar em várias unidades dele.

## 4. Usuários

| Papel | O que faz |
|---|---|
| Admin | Configura unidades, salas e acordos financeiros; acompanha o financeiro. |
| Recepção | Agenda, cadastra pacientes, faz check-in, dá baixa em pagamentos. |
| Profissional | Reserva salas, gerencia a própria agenda, vê o extrato. |
| Paciente | Sem login: confirma ou cancela a consulta por link recebido no WhatsApp. |

## 5. Agenda: reserva de sala e agendamento

- **Reserva de sala:** profissional + sala + período (avulsa ou recorrente, ex.: "toda terça, 8h–12h, sala 2").
- **Agendamento:** paciente + profissional, sempre dentro de uma reserva.
- Conflitos são impedidos pelo próprio banco (`EXCLUDE USING gist` sobre `tstzrange`): uma sala não tem duas reservas sobrepostas e um profissional não tem dois pacientes no mesmo horário.

## 6. Motor financeiro

Ledger (livro-razão) **append-only**, gerado por um serviço de domínio a partir dos eventos da agenda. Cada lançamento é idempotente e correções são feitas por estorno.

- **Fluxo de recebimento:** caixa centralizado (paciente paga ao espaço, que repassa ao profissional) ou pagamento direto (paciente paga ao profissional, que paga a locação).
- **Modelos de locação:** por turno/hora, valor fixo por consulta, percentual do procedimento ou mensalidade fixa (pacote de horas ou sala dedicada).
- **Faltas e cancelamentos:** por acordo, isentar, cobrar integral ou cobrar percentual; prazo mínimo de cancelamento.
- **Acordos versionados** por vigência: reajustes não alteram o passado.
- **Fechamento mensal** com extrato por profissional e baixa manual de pagamentos.

> No modelo percentual com pagamento direto, o valor do atendimento é declarado pelo profissional (com auditoria).

## 7. Stack e segurança

- **Aplicação:** Next.js (App Router) full-stack + Tailwind CSS + shadcn/ui.
- **Dados:** PostgreSQL 16 em Docker, Drizzle ORM (migrations em SQL).
- **Autenticação:** Better Auth (self-hosted, no próprio Postgres).
- **Jobs:** worker separado com pg-boss (lembretes, recorrências, fechamentos).
- **Notificações:** WhatsApp Cloud API (Meta), via padrão outbox.
- **Isolamento:** `tenant_id` em todas as tabelas + Row Level Security do Postgres (`SET LOCAL app.tenant_id` por transação; papel da aplicação sem `BYPASSRLS`).
- **LGPD:** consentimento para lembretes, trilha de auditoria, minimização de dados e anonimização a pedido do titular.

## 8. Modelo de dados (MVP)

- `tenants`, `planos_saas`, `tenant_settings`, `users`, `memberships`, `audit_log`
- `unidades`, `horarios_funcionamento`, `feriados`, `salas`, `recursos_sala`
- `profissionais`, `acordos_financeiros`
- `regras_recorrencia`, `reservas_sala`, `pacientes`, `agendamentos`
- `lancamentos`, `fechamentos`, `pagamentos`
- `notificacoes_outbox`, `consentimentos`

## 9. Roadmap

| Fase | Entrega |
|---|---|
| 0 | Fundação: Docker, auth, multi-tenant, RLS, auditoria, CI |
| 1 | Unidades, salas, profissionais e reservas (avulsas e recorrentes) |
| 2 | Pacientes e agendamentos |
| 3 | Financeiro: acordos, ledger, fechamento e extrato |
| 4 | Lembretes e confirmação por WhatsApp |
| Pós-MVP | NFS-e, cobrança do SaaS, cobrança via PIX/boleto, prontuário eletrônico, agendamento online |
