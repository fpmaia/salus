# Plano de testes do Salus

Este documento diz **o que precisa funcionar**, **qual teste prova isso** e **o que ainda é verificado à mão**. Ele cobre os três
eixos que controlam o produto: **papel** (quem usa), **plano** (quanto o espaço paga e até onde cresce) e **situação da
assinatura** (em dia, em atraso, suspensa). Os módulos opcionais (NFS-e, agenda online, prontuário) entram como um quarto eixo.

Atualize a matriz sempre que uma funcionalidade nova entrar: toda linha aponta para um teste automatizado ou para o checklist manual.

## Como rodar

| O quê | Comando | Precisa de |
|---|---|---|
| Tipos e lint | `npx tsc --noEmit` e `npm run lint` | — |
| Unitários (domínio puro) | `npm run test:unit` | — |
| Integração (Postgres real, RLS) | `npm run test:integration` | `npm run db:up` (Postgres na porta 5433) |
| Tudo do Vitest | `npm test` | idem |
| Ponta a ponta (navegador) | `npm run test:e2e` | idem; sobe o app na porta 3100 com o banco `salus_test` |
| Telas e animações do manual (`/manual`) | `npm run manual:telas` | idem; gera `public/manual/telas` e `public/manual/animacoes` |

Notas:

- Integração e E2E usam o mesmo banco `salus_test`: **não rode os dois ao mesmo tempo**.
- Com o projeto dentro do OneDrive, as pastas `.next-e2e` e `test-results` às vezes ficam travadas (`EPERM`). Apague `.next-e2e`
  e rode o Playwright com `--output` fora do OneDrive (ex.: `--output %TEMP%\pw-out`).
- O CI (`.github/workflows/ci.yml`) roda lint, tipos, Vitest, build, E2E, teste de backup e a checagem do compose de produção.

Situação em 28/10/2026: **528 testes no Vitest (27 arquivos unitários + 32 de integração) e 27 fluxos E2E, todos passando.**

## Pirâmide

| Camada | Onde | Para quê |
|---|---|---|
| Unitário | `src/**/*.test.ts` | Regras puras: preço, fatura, carência, licença, máscaras, fuso, recorrência, RBAC |
| Integração | `tests/integration/*.test.ts` | Serviços com o papel real do app (`salus_app`), RLS, constraints do banco, gateway falso |
| E2E | `tests/e2e/*.spec.ts` | O usuário na tela: login, menus por papel, agenda, planos, módulos, paciente |
| Manual | checklist no fim deste documento | Integrações reais (Asaas, WhatsApp, e-mail, NFS-e, Sentry, backup) |

## 1. Papéis × funcionalidades

Legenda: ✅ pode · ⛔ não pode (servidor recusa e a página mostra "Acesso restrito") · 👤 só o próprio.

| Funcionalidade | Admin | Recepção | Profissional | Testes |
|---|---|---|---|---|
| Agenda: ver grade e lista | ✅ | ✅ | ✅ | E2E `fluxos-criticos` (agenda), `painel.test` |
| Reservar sala | ✅ | ✅ | 👤 | E2E "profissional reserva uma sala", `reservas.test` |
| Agendar paciente (1 passo, cadastro rápido) | ✅ | ✅ | 👤 | E2E "equipe agenda em 1 passo", `agendamentos.test` |
| Check-in, falta, desfazer, remarcar, arrastar | ✅ | ✅ | 👤 | E2E idem, `recepcao.test` |
| Lista de espera | ✅ | ✅ | ⛔ | `controle-acesso.spec`, `modulos-rbac.test` |
| Pacientes (cadastro, menor com responsável) | ✅ | ✅ | 👤 (vinculados) | E2E recibo/menor, `pacientes-recibo.test` |
| LGPD: exportar e anonimizar paciente | ✅ | ⛔ | ⛔ | `titular.test` |
| Financeiro, fechamento do mês, CSV | ✅ | ver | ⛔ | E2E fechamento, `financeiro.test`, `controle-acesso.spec` |
| Fechar/reprocessar o mês, ajustes | ✅ | ⛔ | ⛔ | `financeiro.test`, `modulos-rbac.test` |
| Meu extrato e PIX do saldo | ⛔ | ⛔ | ✅ | `autoatendimento.test`, `controle-acesso.spec` |
| Contratos: criar, reajustar, editar, encerrar | ✅ | ver | 👤 ver | E2E reajuste/"meu contrato", `contratos.test` |
| Unidades, salas, feriados, módulos | ✅ | ⛔ | ⛔ | E2E feriado, `controle-acesso.spec`, `recorrencia-impacto.test` |
| Profissionais e convites | ✅ | ✅ | ⛔ | E2E convite, `equipe.test` |
| Equipe (membros, papéis) | ✅ | ⛔ | ⛔ | `controle-acesso.spec` ("Área restrita"), `equipe.test` |
| Notificações e WhatsApp | ✅ | ⛔ | ⛔ | `notificacoes.test`, `whatsapp-fechamento.test` |
| Assinatura do Salus (plano, faturas, licenças) | ✅ | ⛔ | ⛔ | `planos-e-modulos.spec`, `assinatura.test` |
| Prontuário: escrever/ler o próprio | ⛔ | ⛔ | ✅ | `prontuario.test`, `planos-e-modulos.spec` |
| Prontuário: solicitação formal (desligado) | ✅ | ⛔ | ⛔ | `prontuario.test` |
| Agenda online: configurar | ✅ | ⛔ | 👤 | `agendamento-online.test`, `planos-e-modulos.spec` |
| NFS-e: configurar/emitir · ver | ✅ · ✅ | ⛔ · ✅ | ⛔ | `fiscal.test` |
| Perfil, senha, 2FA | ✅ | ✅ | ✅ | E2E 2FA, `observabilidade.test` |

A tabela-verdade completa de `PERMISSOES` fica em snapshot (`src/domain/__snapshots__/rbac.test.ts.snap`): qualquer mudança de
permissão aparece no diff e deve ser refletida aqui e no manual.

**Superadmin (dono da plataforma, `/plataforma`)**: exige `users.role = superadmin` e 2FA. Métricas, clínicas (suspender,
reativar, trocar plano, detalhe), usuários (banir), planos (editar preço, limites, excedentes), faturamento e auditoria. Testes:
`plataforma.test` (integração). Não há E2E porque o seed não cria superadmin com 2FA (ver pendências).

**Paciente (sem login)**: link do agendamento (confirmar, cancelar, `.ics`) e página pública de agendamento. Testes: E2E "paciente
abre o link", `planos-e-modulos.spec` (agenda pela página pública), `notificacoes.test`, `agendamento-online.test`, `limite-taxa.test`.

## 2. Planos × recursos

Os planos diferem **só** em preço, limites, excedentes e preço do prontuário. Todos os módulos existem em todos os planos.
Fonte única dos números públicos: `src/domain/planos.ts` (o teste `planos-limites.test` confere que bate com `planos_saas`).

| | Básico R$ 199 | Pro R$ 499 | Enterprise R$ 1.299 | Testes |
|---|---|---|---|---|
| Unidades incluídas | 1, **sem extra** (bloqueia) | 3, extra R$ 149 | 50, extra R$ 149 | `planos-limites.test` |
| Salas incluídas | 5, extra R$ 39,90 | 20, extra R$ 39,90 | 500, extra R$ 39,90 | `planos-limites.test`, `cobranca.test` |
| Profissionais incluídos | 15, extra R$ 19,90 | 60, extra R$ 19,90 | 2.000, extra R$ 19,90 | idem |
| Prontuário por profissional | R$ 49,90 | R$ 49,90 | R$ 39,90 | `licenca-prontuario.test` |
| Reativar unidade conta no limite | ✅ | ✅ | ✅ | `planos-limites.test` |
| Upgrade | na hora | na hora | — | `planos-limites.test`, `planos-e-modulos.spec` |
| Downgrade | bloqueia só por unidade a mais no Básico; salas/profissionais viram excedente | | | `planos-limites.test`, `cobranca.test` |
| Simulador da landing recomenda o mais barato | | | | `planos.test` |

## 3. Situação da assinatura

| Situação | O que acontece | Testes |
|---|---|---|
| Em dia | tudo funciona | — |
| Fatura vencida (até 15 dias) | aviso só para quem paga (admin); e-mail 5 dias antes da suspensão | `assinatura.test`, `cobranca.test` (limites dos dias 21/25/26) |
| Suspensa por atraso (dia 16 após o vencimento) | painel só leitura para todos; ações recusam; agenda online some; volta sozinho ao pagar | `assinatura.test`, `agendamento-online.test` |
| Liberado na suspensão | pagar/trocar plano, aceitar convite de equipe, pagar a própria licença, desligar licença, perfil/senha/2FA, solicitação formal de prontuário | `src/server/acao.ts` (`liberadaNaSuspensao`) |
| Suspensa pela plataforma (superadmin) | o usuário vê "Acesso ao espaço suspenso" e não cai no cadastro de novo espaço | `plataforma.test` |
| Em teste grátis (convite da plataforma) | espaço no plano do convite; sem fatura durante o teste nem no mês em que termina; aviso para quem paga; superadmin estende ou encerra | `convite-trial.test`, `cobranca.test`, E2E `teste-gratis.spec` |

## 4. Módulos opcionais

Desligados por padrão. Desligado: some do menu, a página mostra "Acesso restrito" **e o servidor recusa a ação** (antes só a
página bloqueava). O prontuário não pode ser desligado se houver registros (guarda de 20 anos).

| Módulo | Testes |
|---|---|
| NFS-e | `modulos-servidor.test`, `fiscal.test`, `controle-acesso.spec` |
| Agenda online | `modulos-servidor.test`, `agendamento-online.test`, `planos-e-modulos.spec` |
| Prontuário | `modulos-servidor.test`, `prontuario.test`, `licenca-prontuario.test`, `planos-e-modulos.spec` |

## 5. Licença do prontuário

| Estado | Quando | Escrever | Fatura do espaço | Testes |
|---|---|---|---|---|
| Inativa | nunca ativada ou desligada pelo admin | ⛔ (só leitura do histórico) | — | `licenca-prontuario.test` |
| Teste | 15 dias da primeira ativação | ✅ | não | idem, `cobranca.test` |
| Ativa (paga pelo espaço) | ativada pelo admin, depois do teste | ✅ | entra, no preço do plano | idem |
| Ativa (paga pelo profissional) | ativada pelo profissional, pagamento em dia (30 dias por pagamento) | ✅ | nunca | idem |
| Aguardando pagamento | do profissional, sem pagamento válido | ⛔ (só leitura) | — | idem |

Também coberto: "Já paguei" sem cobrança paga não ativa; cobrança em aberto é reaproveitada; webhook deduplicado e conferido
contra a cobrança atual; reativar não dá segundo teste; o admin pode assumir pelo espaço uma licença vencida do profissional.

## 6. Defeitos encontrados e corrigidos

| # | Defeito | Correção | Prova |
|---|---|---|---|
| 1 | "Já paguei" ativava o prontuário sem pagamento (licença de teste sem cobrança) | Confirma só cobrança em aberto e paga no gateway | `licenca-prontuario.test` |
| 2 | Licença do prontuário só era checada na página | Checagem no servidor em rascunho, adendo, finalizar e anexo | `licenca-prontuario.test` |
| 3 | Teste de 15 dias nunca terminava e a cobrança começava calada | Estados explícitos (`estadoLicencaProntuario`) e responsável pelo pagamento | `cobranca.test`, `licenca-prontuario.test` |
| 4 | Prontuário podia ser cobrado duas vezes (avulso + fatura), sempre R$ 49,90 e com referência fixa | Espaço paga na fatura, profissional paga avulso — nunca os dois; preço do plano; referência única | `licenca-prontuario.test` |
| 5 | Reativar unidade furava o limite do Básico | `exigirLimite` na reativação | `planos-limites.test` |
| 6 | Downgrade bloqueava por salas/profissionais, que são excedente | Só unidade bloqueia | `planos-limites.test`, `cobranca.test` |
| 7 | Superadmin não conseguia editar plano (sem permissão no banco) e sem validação | Função `SECURITY DEFINER` + validação | `plataforma.test` |
| 8 | Faturamento da plataforma vazio e detalhe da clínica sempre "não encontrada" (RLS) | Função `SECURITY DEFINER` / contexto do tenant | `plataforma.test` |
| 9 | Status da licença procurava o profissional pelo id errado | Busca pelo vínculo do usuário | `licenca-prontuario.test` |
| 10 | Arrastar para remarcar, cadastro rápido e conectar WhatsApp ignoravam a suspensão | Passam pela checagem da assinatura | revisão + `assinatura.test` |
| 11 | Módulos desligados só bloqueavam a página | `exigirModulo` no servidor | `modulos-servidor.test` |
| 12 | Espaço suspenso pela plataforma mandava o usuário criar outro espaço | Tela "Acesso ao espaço suspenso" | `plataforma.test` |
| 13 | Nova versão de contrato com término criava lacuna sem contrato | Só encerra a anterior se a nova cobre até o fim dela | `contratos.test` |
| 14 | Contrato aparecia "encerrado" no próprio último dia | Último dia ainda é vigente | `contratos.test` |
| 15 | Lista "Meu dia" do profissional no celular sumiu no redesenho da agenda | Restaurada | E2E "no celular" |
| 16 | Modais da agenda sem `role="dialog"` e campos de remarcar sem rótulo | Semântica de diálogo e rótulos | E2E da agenda |
| 17 | Trocar de plano não mostrava a confirmação (o formulário era desmontado) | Formulário mantido (desabilitado no plano atual) | `planos-e-modulos.spec` |
| 18 | Landing prometia plano anual, recursos exclusivos por plano, SLA, depoimentos e métricas inventados, "criptografia ponta a ponta" | Textos alinhados ao produto; preços de fonte única | E2E landing, `planos-limites.test` |
| 19 | Textos diziam que a fatura "fecha no dia 1º" | "Gerada no início do mês, vence dia 10" | revisão |
| 20 | Teste desatualizado (mensagem do limite) derrubava outros 2 em cascata | Asserção atualizada | `assinatura.test` |
| 21 | Faturamento da plataforma mostrava "Em atraso: R$ 0,00" com espaço já suspenso (pendente vencida contava como "em aberto") | `statusParaExibir` | `cobranca.test` |
| 22 | O estilo do botão de check-in pintava o formulário inteiro, inclusive a mensagem de erro | Estilo padrão do botão | gravação do manual |
| 23 | Convidado pela tela Equipe com papel profissional ficava sem cadastro de profissional (sem licença do prontuário, agenda e extrato) | Cadastro criado ou vinculado pelo e-mail no aceite e na troca de papel | `equipe.test` |
| 24 | Impressão de registro compartilhado saía com o nome de quem imprimia, e rascunho podia ser impresso | Autor do registro; só finalizado | `prontuario.test` |
| 25 | Quem criava conta pelo convite da Equipe voltava para a página do convite de profissional ("convite inválido") | Retorno ao convite por tipo (`destino-convite.ts`) | E2E `teste-gratis.spec` (mesmo caminho) |

## 7. Pendências conhecidas (não corrigidas)

- **Downgrade às vésperas da fatura**: a fatura usa o plano vigente no dia em que é gerada; quem desce de plano antes do job paga
  o menor. Corrigir exige histórico de plano por competência (decisão de negócio).
- **E2E do superadmin**: o seed E2E não cria superadmin com 2FA; a área é coberta só por integração.
- **Cobrança avulsa do profissional exige CPF no cadastro** (o Asaas não cria cliente sem documento): a mensagem orienta a
  preencher em Profissionais.
- **Animações e prints do manual** são gerados por `npm run manual:telas` (ver `tests/manual/`) e versionados em `public/manual/`.
  A animação do check-in só é gravada entre 6h e 20h (precisa de uma consulta na próxima hora).
- **Texto "Lembretes D-1"** na tela de Notificações ainda usa jargão.

## 8. Checklist manual (antes de cada versão em produção)

Itens que dependem de serviços reais e credenciais; rode em sandbox/homologação.

- [ ] **Asaas (plataforma)**: gerar fatura do mês, pagar por PIX em sandbox, webhook chega e a fatura vira "paga"; atraso → aviso
  por e-mail → suspensão → pagamento reativa.
- [ ] **Asaas (licença do profissional)**: gerar cobrança, pagar, "Já paguei" ativa; webhook duplicado é ignorado.
- [ ] **Asaas (espaço → profissional)**: conectar a conta do espaço, cobrança do fechamento, baixa automática, estorno.
- [ ] **WhatsApp (Evolution)**: conectar por QR, lembrete chega com link, paciente confirma e cancela pelo link.
- [ ] **E-mail (Resend)**: confirmação de cadastro, redefinição de senha, convite de equipe, aviso de atraso.
- [ ] **NFS-e (Focus, homologação)**: configurar, emitir do mês fechado, cancelar com justificativa.
- [ ] **Turnstile**: cadastro e agendamento online recusam sem o captcha.
- [ ] **Sentry**: erro forçado aparece sem dados pessoais.
- [ ] **Backup**: `npm run backup:testar` restaura e confere.
- [ ] **Celular real**: agenda do profissional, link do paciente e agendamento online em 390 px.
- [ ] **Impressão/PDF**: recibo, contrato, fechamento, prontuário e manual.
