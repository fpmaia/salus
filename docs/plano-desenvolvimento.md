# Plano de Desenvolvimento — Salus

Documento vivo. Registra as decisões de produto e arquitetura, o modelo de dados do MVP e as fases de entrega com critérios de pronto.

## 1. Decisões (ADRs resumidos)

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| 01 | Mercado | Brasil | LGPD, CPF/CNPJ, PIX. NFS-e entra na fase pós-MVP. |
| 02 | Cliente do MVP | Coworking de saúde | Locação de salas com cobrança/repasse é o diferencial e é pouco atendida. |
| 03 | Identidade | `users` global + `memberships` por tenant; UI limitada a 1 tenant por usuário | E-mail é único no auth; evita migração futura caso um profissional atue em mais de um tenant. |
| 04 | Prontuário | Pós-MVP | Produto regulado (CFM, guarda de 20 anos, ICP-Brasil); não pode ser feito "pela metade". |
| 05 | Dinheiro | MVP apenas calcula e registra (extrato, fechamento, baixa manual) | Gateway com split exige KYC e aumenta muito o escopo. |
| 06 | Usuários | Admin, Recepção e Profissional com login; Paciente sem login | Paciente interage só via link assinado (confirmar/cancelar). |
| 07 | Modelos de locação | Turno/hora, fixo por consulta, percentual do procedimento, mensalidade fixa | Cobre os contratos mais comuns em coworking de saúde. |
| 08 | Stack | Next.js (App Router) full-stack, Tailwind, shadcn/ui, Drizzle, Better Auth, Postgres 16 em Docker, pg-boss | Monolito com poucas peças para dev solo; tudo dentro do Postgres (inclusive a fila). |
| 09 | Regras financeiras | Serviço de domínio na aplicação, não triggers | Testável, versionável, legível. O banco garante integridade (constraints, unicidade), não regra de negócio. |
| 10 | Isolamento | `tenant_id` em todas as tabelas + RLS com `current_setting('app.tenant_id')` | Defesa em profundidade sem depender de Supabase. |
| 11 | Deploy | Indefinido; tudo em Docker Compose (app, worker, db) | Mantém portabilidade (VPS ou gerenciado). |

## 2. Conceitos de domínio

### 2.1 Reserva de sala x Agendamento
A proposta original usava a "tripla amarração" (Sala + Profissional + Paciente) como unidade única. No coworking existem **dois níveis**:

- **Reserva de sala** (`reservas_sala`): profissional ocupa uma sala por um período (avulso ou recorrente). É a base da cobrança por turno/hora e da mensalidade.
- **Agendamento** (`agendamentos`): paciente atendido pelo profissional, sempre **dentro** de uma reserva. Agendar um paciente fora de uma reserva existente cria a reserva implicitamente (se a sala estiver livre).

### 2.2 Modelos de cobrança (acordo financeiro)
| Modelo | Fato gerador | Observação |
|---|---|---|
| Turno/hora | Reserva concluída | Cobra pelo período reservado, com ou sem pacientes. |
| Fixo por consulta | Agendamento realizado (ou falta, conforme regra) | Valor fixo por atendimento. |
| Percentual do procedimento | Agendamento realizado com valor | **Limite:** quando o paciente paga direto ao médico, o valor é **declarado pelo profissional** (`valor_declarado`), com auditoria. O sistema não consegue garantir o valor real. |
| Mensalidade fixa | Competência mensal | Pacote de X horas/mês ou sala dedicada; horas excedentes cobradas por hora. |

Regras adicionais por acordo:
- **No-show:** isentar, cobrar integral ou cobrar percentual.
- **Cancelamento:** prazo mínimo (ex.: 24h); cancelamento tardio segue a regra de no-show.
- **Vigência:** acordos são versionados (`vigente_de`, `vigente_ate`); um reajuste não altera lançamentos passados.

### 2.3 Fluxo de recebimento
- **Caixa centralizado:** paciente paga ao coworking; o fechamento gera repasse ao profissional (crédito) descontando a locação.
- **Pagamento direto:** paciente paga ao profissional; o fechamento gera cobrança da locação (débito) ao profissional.

### 2.4 Status
- Reserva: `ativa` → `concluida` | `cancelada`.
- Agendamento: `agendado` → `confirmado` → `presente` → `realizado` | `falta` | `cancelado`.

## 3. Arquitetura técnica

### 3.1 Camadas
```
app/            UI (React Server Components) + Server Actions finas
src/domain/     Regras de negócio puras (agenda, financeiro, notificações) — sem I/O
src/db/         Schema Drizzle, migrations SQL, helper withTenant
src/worker/     Processo separado (pg-boss): jobs agendados e filas
```

### 3.2 Multi-tenant e RLS (Postgres puro)
- A aplicação conecta com um papel **sem** `BYPASSRLS` e não dono das tabelas; migrations rodam com outro papel.
- Todas as tabelas de tenant: `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy `tenant_id = current_setting('app.tenant_id')::uuid`.
- Helper `withTenant(ctx, fn)` abre transação e executa `SET LOCAL app.tenant_id` / `app.user_id` / `app.role`. Nenhuma query de tenant roda fora dele.
- RLS é a **segunda** barreira; a primeira é a autorização na camada de domínio (RBAC por role).

### 3.3 Prevenção de conflitos
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservas_sala ADD CONSTRAINT reservas_sem_sobreposicao
  EXCLUDE USING gist (sala_id WITH =, periodo WITH &&)
  WHERE (status <> 'cancelada');

ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_profissional_sem_sobreposicao
  EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)
  WHERE (status NOT IN ('cancelado'));
```
- Períodos em `tstzrange` (UTC no banco); cada unidade tem `timezone` (padrão `America/Sao_Paulo`).
- Validação de que o agendamento está contido na reserva (`reserva.periodo @> agendamento.periodo`) na camada de domínio + check via trigger simples de integridade.

### 3.4 Ledger financeiro
- `lancamentos` é **append-only**: sem UPDATE/DELETE (revogar privilégios do papel da aplicação).
- Correção = lançamento de estorno referenciando o original.
- `idempotency_key` UNIQUE (ex.: `agendamento:{id}:realizado`) — reprocessar um evento nunca duplica cobrança.
- Valores em **centavos** (`integer`/`bigint`).
- `fechamentos` por profissional + competência; fechado = imutável.

### 3.5 Jobs (worker com pg-boss)
- Materializar recorrências numa janela de 8–12 semanas.
- Agendar e enviar lembretes (outbox).
- Concluir reservas passadas e gerar lançamentos.
- Gerar mensalidades e fechamentos mensais.

### 3.6 Notificações
- Interface `NotificationProvider`; primeira implementação: **WhatsApp Cloud API (Meta)** com templates aprovados.
- Padrão **outbox** (`notificacoes_outbox`): gravado na mesma transação do evento, enviado pelo worker com retry.
- Link de confirmação/cancelamento com token assinado (HMAC) e expiração; sem login do paciente.

### 3.7 LGPD
- Agenda de pacientes já revela dado de saúde (especialidade, frequência) → tratar como dado sensível.
- Registro de consentimento para lembretes (`consentimentos`), minimização de dados no cadastro.
- `audit_log` para acessos e alterações relevantes (quem, quando, o quê).
- Rotina de anonimização/exclusão a pedido do titular.

### 3.8 Testes
- **Vitest** para o domínio — motor financeiro com tabelas de casos (cada modelo × no-show × fluxo de recebimento).
- **Integração com Postgres real** (Testcontainers ou o próprio compose): RLS (tenant A não lê tenant B), constraints gist, idempotência do ledger.
- **Playwright** para fluxos críticos (reservar sala, agendar, fechar mês).

## 4. Modelo de dados do MVP

| Grupo | Tabelas |
|---|---|
| Identidade e organização | `tenants`, `planos_saas`, `tenant_settings`, `users`, `memberships` (role: `admin`, `recepcao`, `profissional`), `audit_log` |
| Espaço | `unidades` (endereço, timezone), `horarios_funcionamento`, `feriados`, `salas`, `recursos_sala` |
| Profissionais | `profissionais` (conselho, nº registro, especialidade, `membership_id`), `acordos_financeiros` (modelo, valores, regra de no-show/cancelamento, fluxo de recebimento, vigência) |
| Agenda | `regras_recorrencia`, `reservas_sala` (`periodo tstzrange`, status, `recorrencia_id`), `pacientes`, `agendamentos` (`reserva_id`, `periodo`, status, `valor_declarado`) |
| Financeiro | `lancamentos` (ledger), `fechamentos` (competência, status), `pagamentos` (baixa manual) |
| Notificações | `notificacoes_outbox`, `consentimentos` |

Toda tabela de tenant tem `id uuid`, `tenant_id uuid`, `criado_em`, `atualizado_em`.

## 5. Fases e critérios de pronto

### Fase 0 — Fundação
- Docker Compose (Postgres 16, app, worker), Next.js, Tailwind, shadcn/ui, Drizzle, Better Auth.
- Tenants, memberships, RBAC; onboarding mínimo (criar tenant + admin).
- RLS + helper `withTenant`; `audit_log`; seed de desenvolvimento; CI (lint, typecheck, testes).

**Pronto quando:** teste de integração prova que um usuário do tenant A não lê nem grava dados do tenant B, mesmo com query sem filtro; CI verde.

### Fase 1 — Espaço e salas
- CRUD de unidades (timezone, horários, feriados), salas e recursos.
- Cadastro/convite de profissionais.
- Reservas avulsas e recorrentes (com exceções), calendário por unidade/sala.
- Portal do profissional para reservar sala.

**Pronto quando:** duas reservas sobrepostas na mesma sala são rejeitadas pelo banco; reserva fora do horário de funcionamento ou em feriado é recusada; recorrência semanal materializa as próximas semanas.

**Status: concluída** (critérios cobertos em `tests/integration/reservas.test.ts`). Decisões de implementação:
- **Convite:** link com token (válido por 7 dias, só o hash SHA-256 fica no banco) que o admin copia e envia por WhatsApp. O aceite exige o mesmo e-mail do cadastro do profissional e roda numa função `SECURITY DEFINER` (`app_aceitar_convite`). Envio por e-mail fica para depois.
- **Reserva do profissional:** confirmação imediata quando a sala está livre e dentro do horário. Admin e recepção reservam para qualquer profissional e cancelam qualquer reserva; o profissional cancela só as suas, antes do início.
- **Grade:** própria (Tailwind). Visão diária com as salas em colunas e semanal por sala. Slot por unidade (15, 30 ou 60 min; padrão 30). Para o profissional, reservas de terceiros aparecem como "Ocupado".
- **Conflitos:** dois `EXCLUDE USING gist` em `reservas_sala`, um por sala e outro por profissional, ignorando as canceladas. Intervalos semiabertos `[início, fim)`.
- **Isolamento:** FKs compostas `(tenant_id, x_id)` entre tabelas de tenant, porque a FK não passa pela RLS.
- **Recorrência:** semanal. Na criação, materializa a janela de 8 semanas e é rejeitada por inteiro se houver conflito, informando as datas; feriados são pulados. O worker estende a janela diariamente (conflitos posteriores são pulados e auditados). Cancelar uma ocorrência não a recria; "encerrar série" cancela as futuras.
- **Worker:** jobs `agenda.materializar-recorrencias` (diário) e `agenda.concluir-reservas` (a cada 15 min), um tenant por vez via `withSistema`.

### Fase 2 — Agenda de pacientes
- Cadastro de pacientes (CPF opcional, contato, consentimento).
- Agendamentos dentro de reservas; fluxo de status; check-in pela recepção.
- Política de cancelamento.

**Pronto quando:** agendamento fora da reserva cria reserva ou é recusado (sala ocupada); profissional não tem dois pacientes no mesmo horário; transições de status inválidas são bloqueadas.

**Status: concluída** (critérios cobertos em `tests/integration/agendamentos.test.ts`). Decisões de implementação:
- **Visibilidade (LGPD):** admin e recepção veem todos os pacientes. O profissional vê só os vinculados a ele (`pacientes_profissionais`: os que cadastrou ou que têm agendamento com ele) e, no histórico, só os próprios atendimentos. O `audit_log` não guarda dados pessoais do paciente. Paciente não é apagado, apenas inativado.
- **Encaixe na reserva:** um trigger garante que o agendamento fica dentro do período de uma reserva ativa do mesmo profissional. Sem reserva no horário, o agendamento com sala informada cria a reserva automaticamente; sem sala, é recusado.
- **Conflitos:** `EXCLUDE USING gist` por profissional e por paciente, ignorando os cancelados.
- **Status:** agendado → confirmado → presente → realizado; falta e cancelado saem do fluxo ativo. O check-in abre 1h antes do início; realizado e falta só depois do início; cancelar só antes dele. Admin e recepção alteram qualquer agendamento; o profissional, só os seus.
- **Política de cancelamento:** `tenant_settings.antecedencia_cancelamento_horas` (padrão 24h). Abaixo disso o cancelamento é marcado como `cancelamento_tardio`, base para a cobrança na Fase 3.
- **Reserva com pacientes:** uma reserva com agendamentos ativos não pode ser cancelada (trigger). "Encerrar série" mantém as ocorrências que têm pacientes e informa quantas ficaram.
- **Telas:** Atendimentos (lista do dia com as ações de status), Pacientes (busca, cadastro, histórico) e o painel da reserva na agenda (pacientes da reserva e agendamento dentro dela).

### Fase 3 — Financeiro
- Acordos versionados com os 4 modelos + no-show + fluxo de recebimento.
- Geração idempotente de lançamentos a partir dos eventos.
- Fechamento mensal, extrato do profissional, baixa manual de pagamento.
- Relatórios: ocupação de salas, receita por unidade/profissional.

**Pronto quando:** tabela de casos cobre todos os modelos × no-show × fluxo; reprocessar eventos não altera saldos; fechamento fechado não aceita novos lançamentos na competência.

**Status: concluída** (casos em `src/domain/financeiro.test.ts`, ponta a ponta em `tests/integration/financeiro.test.ts`). Decisões de implementação:
- **Conta corrente:** o ledger (`lancamentos`) é a conta do profissional com o espaço. Débito = o profissional deve; crédito = o espaço deve (repasse). Só aceita SELECT/INSERT. O estorno repete o tipo com a natureza invertida e aponta `estorno_de`.
- **Conciliação idempotente:** para cada fato gerador (`reserva:<id>`, `agendamento:<id>`, `competencia:<prof>:<mês>`), o domínio calcula os lançamentos devidos e o serviço estorna o que sobra e cria o que falta. Por isso reprocessar não muda nada, e corrigir o valor de um atendimento gera estorno + novo lançamento. A `idempotency_key` é única por tenant.
- **Fatos geradores:**
  - Reserva concluída (modelo hora; gerada pelo worker ou no fechamento).
  - Agendamento realizado, falta ou cancelamento tardio (modelos consulta e percentual).
  - Valor do atendimento, que entra no modelo percentual e gera o repasse no caixa centralizado.
  - Fechamento do mês (mensalidade + horas excedentes).
- **Acordos:** versionados por vigência, sem sobreposição (`EXCLUDE` com `daterange`). Um novo acordo encerra o anterior na véspera. Um `CHECK` com `coalesce` garante os campos de cada modelo. A mensalidade não tem pró-rata.
- **Percentual com pagamento direto:** o valor é declarado e auditado (`agendamento.valor` no `audit_log`). Sem valor informado, não há cobrança.
- **Fechamento:** só depois do fim do mês e em ordem cronológica. Antes de congelar os totais, conclui as reservas passadas, reprocessa a competência e gera a mensalidade; o mês fica imutável (trigger). Correções de um mês fechado caem na próxima competência aberta.
- **Baixa manual:** pagamentos nas duas direções (profissional → espaço, repasse espaço → profissional) e ajustes manuais (só admin).
- **Telas e acesso:**
  - Financeiro: resumo do mês, receita por unidade e ocupação das salas.
  - Página do profissional: extrato, pagamento, ajuste e acordo.
  - "Meu extrato" para o profissional.
  - Campo de valor nos atendimentos.
  - A recepção vê o financeiro e registra pagamentos; acordos, fechamento e ajustes são do admin.

### Fase 4 — Notificações
- Outbox + provider WhatsApp; lembrete D-1 de agendamento e de reserva.
- Link de confirmação/cancelamento para o paciente; opt-in/opt-out.

**Pronto quando:** paciente confirma pelo link e o status muda; cancelamento tardio aplica a regra de no-show; envio com falha é reprocessado sem duplicar.

**Status: concluída** (critérios cobertos em `tests/integration/notificacoes.test.ts`). Decisões de implementação:
- **Outbox (`notificacoes_outbox`):** idempotente por chave (`lembrete_agendamento:<id>:<início>`). Se o atendimento for remarcado, sai um lembrete novo.
- **Job a cada 15 min:** enfileira os lembretes D-1, na janela de 2h a 24h antes. Para pacientes, só com consentimento e telefone válido (normalizado para E.164); para profissionais, um lembrete por reserva.
- **Job a cada minuto (envio), em três passos:**
  1. Reivindica com `FOR UPDATE SKIP LOCKED` e revalida (agendamento ativo, consentimento, horário futuro).
  2. Envia fora da transação.
  3. Registra o resultado.
  - Retentativa com espera crescente (1, 2, 4… min, até 5 tentativas). Erro 4xx da Meta é definitivo. Itens presos em "enviando" voltam para a fila após 10 min (entrega "ao menos uma vez").
- **Provider:** `console` (padrão; registra no log) ou `meta` (WhatsApp Cloud API com templates aprovados; variáveis `WHATSAPP_*` no `.env.example`).
- **Link do paciente (`/c/<token>`):** token HMAC-SHA256 sem estado (tenant, agendamento, validade = fim do atendimento), `noindex` e `no-referrer`. Mostra só o primeiro nome, data, hora, profissional e local.
  - Confirmar e cancelar usam o mesmo núcleo de status da equipe (`aplicarStatusAgendamento`), então o cancelamento tardio pelo link gera a cobrança de falta do acordo.
  - "Parar lembretes" retira o consentimento (LGPD) e cancela os pendentes.
- **Cancelamentos:** cancelar, finalizar ou registrar falta num agendamento, ou cancelar uma reserva, cancela os lembretes pendentes.
- **Tela Notificações (admin):** histórico da outbox com filtro por status e "tentar de novo" para as que falharam.
- **Fora do escopo:** webhook de status de entrega e resposta "PARAR" pelo WhatsApp. O opt-out é feito pelo link.

**MVP concluído (Fases 0–4).** Próxima etapa: pós-MVP, começando pela NFS-e.

**MVP = Fases 0 a 4.**

### Pós-MVP (ordem sugerida)
1. **NFS-e** via provedor (Focus NFe / eNotas) para a locação. **Concluída** (Focus NFe, ver abaixo).
2. **Cobrança do SaaS**: assinatura dos planos Básico/Pro/Enterprise e limites (unidades, salas, profissionais). **Concluída** (Asaas, ver seção 8).
3. **Cobrança do profissional** via PIX/boleto (ex.: Asaas). **Concluída** (seção 8).
4. **Prontuário eletrônico** (**concluído**, seção 10): evolução clínica, anexos, auditoria de acesso, guarda de 20 anos, assinatura ICP-Brasil, prescrição via Memed. Compartilhamento entre profissionais condicionado ao consentimento do profissional e do paciente (o profissional é o controlador dos dados).
5. **Agendamento online público** por profissional. **Concluído** (seção 9).
6. Convênios (TISS) — só se houver demanda.

## 6. Riscos e pontos em aberto
- **Escopo vs. dev solo sem piloto:** se o prazo apertar, cortar primeiro o modelo "percentual do procedimento".
- **Validação de mercado:** buscar um coworking piloto até o fim da Fase 1.
- **WhatsApp Cloud API:** aprovação de templates e verificação do negócio levam tempo — iniciar o processo cedo.
- **RLS sem Supabase:** depende de disciplina; toda query passa por `withTenant` e há teste de vazamento no CI.
- **Deploy:** decidir antes da Fase 4 (backups do Postgres são obrigatórios em qualquer opção).

## 7. NFS-e da locação (pós-MVP, concluída)

Testes: `src/domain/fiscal.test.ts`, `src/server/cripto.test.ts` e `tests/integration/fiscal.test.ts`.

- **Padrão:** NFS-e Nacional (DPS) via Focus NFe (`/v2/nfsen`, autenticação Basic com o token como usuário).
  - A LC 214/2025 fixou o padrão nacional para jan/2026; há divergência sobre a obrigatoriedade para os municípios com emissor próprio.
  - Emissores municipais específicos podem entrar depois atrás da mesma interface (`EmissorNfse` em `src/server/fiscal-provider.ts`).
- **O que é faturado:** uma nota por profissional e competência fechada. O espaço é o prestador (CNPJ do tenant); o profissional é o tomador (CPF/CNPJ no cadastro). O valor é a receita de locação líquida do mês (hora, consulta, percentual, falta, mensalidade e excedente). O repasse do caixa centralizado não entra.
- **Configuração por tenant (`configuracoes_fiscais`):**
  - Ambiente `simulado`, `homologacao` ou `producao`.
  - Código IBGE do município, código de tributação nacional do ISSQN, opção e regime do Simples, alíquota, NBS e série.
  - Numeração da DPS sequencial, reservada na mesma transação que cria a nota.
  - Token da Focus cifrado com AES-256-GCM (`SECRETS_KEY`); nunca volta para a tela nem para o `audit_log`.
- **Envio idempotente:** a nota nasce `pendente` com a referência `salus-<id>`. Antes de cada envio o worker consulta a referência; se a Focus já a recebeu, só adota o status. Por isso uma falha de rede não duplica a nota.
- **Status:** `pendente` → `processando` → `autorizada` | `erro` (pré-validação ou autorização negada). O job `fiscal.processar-notas` roda a cada 2 min, até 10 tentativas.
- **Recusas e cancelamento:** uma nota recusada libera nova emissão com novo número. O cancelamento é síncrono, exige justificativa (mín. 15 caracteres) e é definitivo.
- **Telas:**
  - Notas fiscais: pendências da configuração, profissionais a faturar (individual ou em lote), notas do mês com DANFSe/portal, cancelamento e configuração.
  - Nota do mês no extrato do profissional e na página financeira dele.
- **Fora do escopo por ora:** webhook da Focus (`event: "nfsen"`; o polling já cobre), cadastro da empresa na Focus via API (o token vem do painel deles) e reenvio de e-mail.

## 8. Cobranças via Asaas (pós-MVP, concluída)

Testes: `src/domain/cobranca.test.ts`, `tests/integration/cobrancas.test.ts` e `tests/integration/assinatura.test.ts` (com um gateway falso que guarda estado, em `tests/integration/gateway-falso.ts`).

- **Duas contas Asaas, dois fluxos:**
  - **SaaS (Salus → espaço):** conta da plataforma, configurada pelas variáveis `ASAAS_AMBIENTE`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`.
  - **Profissional (espaço → profissional):** conta do próprio espaço, com a chave cifrada por tenant em `configuracoes_cobranca`.
- **API:** v3 (`https://api.asaas.com/v3` e `https://api-sandbox.asaas.com/v3`), header `access_token` e `User-Agent` (obrigatório para contas novas).
  - Cobranças com `billingType` PIX, BOLETO ou UNDEFINED (o pagador escolhe).
  - Multa e juros só são enviados se configurados, para não sobrescrever o padrão da conta.
- **Ambiente `simulado` (padrão):** nada sai do sistema; botões "Simular pagamento" para desenvolvimento e demonstração.
- **Planos e limites:**
  - Os limites de `planos_saas.limites` são aplicados ao criar ou reativar unidades, salas e profissionais.
  - A troca de plano vale a partir da próxima fatura; o downgrade é recusado se o uso não couber no novo plano.
- **Fatura do SaaS:** uma por tenant e mês (`faturas_saas`, idempotente), pelo preço do plano. Vence no dia 10 ou, se gerada depois disso, em 3 dias.
  - Job diário `assinatura.gerar-faturas` e sincronização a cada 30 min.
  - Fatura vencida mostra um aviso no painel do admin. A suspensão do tenant continua manual.
- **Cobrança do profissional:** gerada na página financeira do profissional (valor sugerido = saldo), com vencimento padrão configurável. O cliente Asaas é criado uma vez por profissional e exige CPF/CNPJ.
- **Webhooks:**
  - Rotas: `/api/webhooks/asaas/plataforma` e `/api/webhooks/asaas/<tenantId>`.
  - Autenticação pelo header `asaas-access-token`. O token do tenant é gerado na tela, mostrado uma vez e guardado como hash.
  - Idempotência pelo `id` do evento (`eventos_webhook`).
  - O status nunca vem do payload: o serviço consulta a cobrança na API e aplica o status oficial.
  - Jobs de reserva (`cobrancas.sincronizar` a cada 15 min, `assinatura.sincronizar`) cobrem webhooks perdidos.
- **Baixa automática:** cobrança paga gera o pagamento e o lançamento de crédito no ledger, uma única vez. Um estorno ou chargeback depois do pagamento gera o estorno do lançamento.
  - Estados finais não regridem: um webhook atrasado de "pendente" não desfaz um pagamento.
- **Sem duplicar no Asaas:** se a resposta da criação se perder, o reenvio busca a cobrança pela `externalReference` antes de criar outra.
- **Formulários (`FormAcao`):** mantêm a prop `action` para envio antes da hidratação (sem ela, um envio precoce viraria GET com os campos na URL) e usam `onSubmit` depois de hidratados, para não apagar o que foi digitado num erro.
- **Fora do escopo por ora:** suspensão automática por inadimplência, split de pagamento, cartão recorrente e PIX Automático.

## 9. Agendamento online (pós-MVP, concluído)

Testes: `src/domain/disponibilidade.test.ts` e `tests/integration/agendamento-online.test.ts`.

- **Página pública `/agendar/<slug>`:** sem login, ativada pelo próprio profissional ou pelo admin em "Agenda online".
  - O slug é gerado do nome com sufixo aleatório e é único na plataforma.
  - A função `SECURITY DEFINER` `app_profissional_publico` resolve tenant e profissional só quando o agendamento online está ativo; o resto roda com a RLS do tenant.
- **Oferta:** só horários dentro das reservas de sala ativas do profissional (ele controla a oferta reservando sala), descontando atendimentos não cancelados.
  - Passo = slot da unidade; duração da consulta, antecedência mínima e janela máxima configuráveis.
  - O cálculo é puro (`horariosLivres`).
- **Agendar:**
  - O horário escolhido é recalculado contra a oferta atual, então não dá para forjar horário fora das reservas. O `EXCLUDE` do banco resolve a corrida entre dois pacientes ("o horário acabou de ser ocupado").
  - O paciente é reaproveitado pelo CPF ou pelo celular normalizado, sem expor nem alterar o cadastro existente. O consentimento para lembretes só é adicionado, nunca retirado por aqui.
  - O agendamento é marcado com `origem = online`. A resposta traz o link `/c/<token>` da Fase 4 para confirmar ou cancelar, e os lembretes D-1 seguem o fluxo normal.
- **Proteções:** aceite LGPD obrigatório, celular válido, campo-isca contra robôs e no máximo 3 agendamentos online futuros por paciente.
- **Telas:**
  - Página pública responsiva (escolha de dia e horário + dados).
  - "Agenda online" no painel, com o link para divulgar.
  - Selo "online" na lista de atendimentos.
- **Fora do escopo por ora:** CAPTCHA, confirmação de celular por código, escolha entre vários profissionais numa mesma página e pagamento antecipado.

## 10. Prontuário eletrônico (pós-MVP, concluído)

Testes: `tests/integration/prontuario.test.ts`.

**Decisões regulatórias tomadas com o usuário:**

| Tema | Decisão |
|---|---|
| Assinatura | Eletrônica simples: autoria, data/hora e hash SHA-256 de integridade. ICP-Brasil (NGS2), necessária para dispensar o papel perante o CFM, fica para uma fase seguinte. |
| Acesso | Só o autor lê o que escreveu. O compartilhamento com outro profissional exige o consentimento do paciente registrado e é revogável. Admin e recepção nunca leem conteúdo clínico. |
| Prescrição | Texto livre na evolução, mais impressão/PDF. Receita digital (Memed) fica para depois. |
| Anexos | Armazenamento S3 compatível (SeaweedFS no Docker; S3/R2 em produção), com os arquivos cifrados pela aplicação. |
| Correções | Rascunho editável; depois de finalizado, imutável. Correção por adendo vinculado ao original. |
| Saída do profissional | Ele exporta quando quiser. Depois de desligado, perde o acesso, e os registros ficam guardados; o admin só os vê por solicitação formal justificada (auditada, válida por 1 hora). |
| Cifragem | Texto e arquivos com AES-256-GCM por chave de dados do tenant (envelope sob `SECRETS_KEY`). Não há busca textual no conteúdo. |
| Auditoria | Toda leitura, exportação, download e solicitação vai para o `audit_log`. |

**Implementação:**
- **RLS por profissional:** `registros_clinicos`, `anexos_clinicos` e `compartilhamentos_clinicos` usam `app.profissional_id` (helper `withProntuario`). Nessas tabelas não existe a policy genérica de tenant (policies permissivas se somam com OR). Quem recebe compartilhamento só vê registros finalizados.
- **Imutabilidade no banco:**
  - Triggers impedem alterar ou apagar registro finalizado e trocar paciente, autor ou tipo de um rascunho.
  - O adendo só vale sobre evolução finalizada do mesmo paciente e do mesmo autor.
  - Anexos só entram e saem de rascunhos.
- **Integridade:** hash sobre a forma canônica do registro (conteúdo, autoria, paciente, atendimento, anexos e data de finalização), conferido a cada leitura. Uma adulteração feita por fora do app aparece como "integridade NÃO confere".
- **Anexos:** PDF, JPG, PNG ou WebP, até 10 MB.
  - Upload por route handler (`/api/prontuario/anexos`, sem o limite de corpo das Server Actions).
  - Download decifrado, com hash conferido e `Cache-Control: no-store`.
  - O bucket é criado no primeiro uso.
- **Telas:**
  - Prontuário: pacientes do profissional, linha do tempo (rascunho, finalização, adendo), anexos e compartilhamento.
  - Impressão/PDF e solicitação formal para o admin.
  - Atalho "Prontuário" nos atendimentos.
- **Fora do escopo por ora:** assinatura ICP-Brasil, Memed, modelos de evolução por especialidade e relatório de acessos na tela (o serviço `acessosAoProntuario` já existe).
- **Infra:** o MinIO comunitário foi descontinuado em 2025; o Compose usa o SeaweedFS (`chrislusf/seaweedfs:4.48`) como S3 de dev.

