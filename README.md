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
- **Contrato do profissional:** define o modelo de cobrança (por hora, valor fixo por consulta, percentual do atendimento ou mensalidade, com pacote de horas ou turno fixo), as regras de falta e de cancelamento e a grade fixa semanal, que reserva as salas sozinha. Cada reajuste é uma nova versão.
- **Faltas e cancelamentos:** por contrato: isentar, cobrar integral ou percentual, com prazo mínimo próprio. O sistema registra quem cancelou, e o cancelamento pelo espaço não cobra o profissional. No turno fixo por hora, o profissional que cancela uma data tarde paga a multa do contrato.
- **Versões por vigência:** reajustes não alteram o passado, e o banco impede dois contratos no mesmo período.
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

## 9. Desenvolvimento

Pré-requisitos: Node 22 (`.nvmrc`) e Docker.

```bash
cp .env.example .env          # ajuste BETTER_AUTH_SECRET (e-mails saem no log: EMAIL_PROVIDER=console)
npm install
npm run db:up                 # Postgres 16 em 127.0.0.1:5433 (cria papéis e bancos)
docker compose up -d s3       # S3 local (SeaweedFS) para anexos do prontuário
npm run db:migrate
npm run db:seed               # 2 espaços demo; senha: salus-dev-123
npm run dev                   # http://localhost:3000
```

Contas novas precisam confirmar o e-mail antes de entrar; em dev, o link aparece no log do servidor. Em produção, configure `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` (o boot recusa subir sem isso, ver `src/env.ts`).

Segurança HTTP: a CSP (com nonce) sai do `proxy.ts` e os demais cabeçalhos do `next.config.ts` (`src/seguranca/cabecalhos.ts`). O rate limit fica na tabela `rate_limits` e lê o IP de `IP_HEADER` (padrão `x-real-ip`), que o reverse proxy deve sobrescrever. O captcha (Turnstile) liga com `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`.

LGPD: Termos e Política em `/termos` e `/privacidade` (versão em `src/legal/documentos.ts`; mudou a versão, todos aceitam de novo ao entrar). Na ficha do paciente, o admin exporta os dados (JSON) e anonimiza o cadastro a pedido do titular.

Usuários do seed: `admin|recepcao|profissional@alfa.salus.dev` e `...@beta.salus.dev`. Cada espaço vem com a "Unidade Centro" (3 salas) um profissional sem acesso (`convidado@...`) para testar o convite e três pacientes fictícios.

| Comando | O quê |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest: unitários (`src/**/*.test.ts`) + integração com Postgres real (`tests/integration`, banco `salus_test` recriado a cada execução) |
| `npm run test:e2e` | Playwright: reservar sala, agendar paciente e fechar o mês, no navegador contra o app real (porta 3100, recria o `salus_test`; não rode junto com o `npm test`). Na primeira vez: `npx playwright install chromium` |
| `npm run db:generate` | Gera migration SQL a partir de `src/db/schema.ts` (use `-- --custom` para SQL manual: RLS, grants) |
| `npm run worker` | Worker pg-boss |
| `docker compose up --build` | Stack completa de dev: db, migrate, app e worker |
| `npm run backup:testar` | Backup cifrado + restauração num banco temporário, conferindo o manifesto (requer `npm run db:up`) |

**Multi-tenant na prática**
- O app conecta como `salus_app` (sem `BYPASSRLS`, não dono das tabelas); migrations rodam como `salus_owner`.
- Toda query de tenant passa por `withTenant(ctx, fn)` ([src/db/tenant.ts](src/db/tenant.ts)), que faz `SET LOCAL app.tenant_id/app.user_id/app.role` na transação. Fora dele, tabelas de tenant aparecem vazias.
- Tabela nova com `tenant_id`? Na migration custom: `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy `tenant_isolation` e `GRANT` mínimo ao `salus_app` (veja `0002_rls_e_privilegios.sql`). O teste de integração falha se alguma tabela com `tenant_id` ficar sem RLS.
- Não use `drizzle-kit push`: as políticas vivem nas migrations SQL.

## 10. Roadmap

| Fase | Entrega | Status |
|---|---|---|
| 0 | Fundação: Docker, auth, multi-tenant, RLS, auditoria, CI | ✅ |
| 1 | Unidades, salas, profissionais (convite) e reservas avulsas/recorrentes | ✅ |
| 2 | Pacientes e agendamentos (fluxo de status, cancelamento tardio) | ✅ |
| 3 | Financeiro: acordos, ledger, fechamento, extrato, pagamentos, relatórios | ✅ |
| 4 | Lembretes por WhatsApp (outbox) e link de confirmação do paciente | ✅ |
| Pós-MVP | NFS-e Nacional da locação via Focus NFe | ✅ |
| Pós-MVP | Cobrança do SaaS (planos e limites) e do profissional via PIX/boleto (Asaas) | ✅ |
| Pós-MVP | Agendamento online público por profissional | ✅ |
| Pós-MVP | Prontuário eletrônico (sigilo por profissional, cifrado, imutável com adendo) | ✅ |

Detalhes e decisões de cada fase: [docs/plano-desenvolvimento.md](docs/plano-desenvolvimento.md).

Deploy de produção (VPS com Docker, Caddy, backups e restauração): [docs/deploy.md](docs/deploy.md).

Revisão de produto, maturidade para produção e plano de evolução (out/2026): [docs/revisao-produto-2026-10.md](docs/revisao-produto-2026-10.md).
