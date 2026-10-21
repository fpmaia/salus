# Revisão de produto e prontidão para produção — Salus

> Outubro de 2026. Documento de alto nível: diagnóstico, erros, propostas, o que retirar e plano de evolução.
> Base: leitura completa do código (commitado até `b741c50` **e** o trabalho não commitado do working tree), CI, testes e as decisões de produto tomadas com o fundador nesta revisão.
> **Atualizado em 21/10/2026, depois das Fases A a D:** veja [Status atual](#status-atual--21102026-depois-das-fases-a-a-d). As seções 1 a 9 ficam como o diagnóstico original.

## Progresso

| Data | Fase | Itens resolvidos |
|---|---|---|
| 21/10/2026 | A | Triagem do working tree em 8 commits pelo CI. Corrigidos S1, S2, S5, S6, C2 e C4; contratos desligados (`SALUS_CONTRATOS`). |
| 21/10/2026 | B | E-mail transacional (Resend, com `console` em dev): confirmação obrigatória da conta, redefinição de senha sem token no log e convites de profissional e de equipe por e-mail. Corrigidos S3, S4 e S9 e a mensagem de rate limit no login. |
| 21/10/2026 | B | Segurança HTTP e anti-abuso (S7, S8): CSP com nonce por requisição (`strict-dynamic`, `frame-ancestors 'none'`), HSTS em HTTPS, X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy; rate limit no Postgres (Better Auth e páginas públicas, mesmo cabeçalho de IP do proxy); Turnstile no cadastro, na recuperação de senha e no agendamento online. |
| 21/10/2026 | B | Deploy e backup (O1, O2, parte de O3 e O7): `docker-compose.prod.yml` com Caddy (TLS, `X-Real-IP`), `restart`, healthchecks (app via `/api/health`, worker via heartbeat, backup via último sucesso) e logs com rotação; worker e migrate como usuário não root; backup diário cifrado (age) e enviado por rclone (Postgres + anexos), com retenção diária/mensal e teste de restauração no CI. Guia em `docs/deploy.md`. Validado localmente com a stack de produção completa. |
| 21/10/2026 | B | LGPD (O5): Termos de Uso, Política de Privacidade e contato do encarregado, identificados por variáveis de ambiente; aceite versionado no cadastro, com prova (versão, IP e navegador), e novo aceite obrigatório quando a versão muda; exportação dos dados do paciente (JSON) e anonimização irreversível, recusada com prontuário (guarda de 20 anos) ou com consultas futuras; textos de marketing corrigidos. **Pendente: revisão jurídica dos textos.** |
| 21/10/2026 | B | Observabilidade e 2FA (O3, S11): logs JSON sem dado pessoal; Sentry no servidor (`onRequestError`, ações) e no worker, com coleta de corpo/cookies/cabeçalhos/URL desligada; alertas de jobs com falha e da outbox (falhas e fila parada) no Sentry e por e-mail com limite; TOTP + códigos de recuperação, obrigatório para admins e superadmin. Corrigido bug grave: a instância do app descartava os plugins da config (admin, captcha e 2FA não valiam no app). **Fase B concluída.** |
| 21/10/2026 | C | Contrato unificado (C1, C3, C6, C7): o contrato é o acordo versionado, com código CTR-AAAA-NNNN, prazo de cancelamento próprio, multa de turno fixo, termos e grade fixa que gera as reservas. "Sala fixa" virou mensalidade sem limite (a grade fica coberta e as avulsas pagam a hora). Quem cancelou passa a ser registrado: o tardio pelo espaço não cobra. Um contrato vigente por vez (EXCLUDE no banco). Sem preço nas salas e sem "adoção" silenciosa de reservas. |
| 21/10/2026 | C | Ferramentas da recepção (C5, C16 e usabilidade da agenda): remarcar mantendo o registro (volta a "agendado", descarta o lembrete antigo, nunca cobra); desfazer a última mudança de status (equipe, até 24h, estorna o financeiro e reativa a reserva liberada); a reserva criada sozinha pelo agendamento é liberada ao remarcar ou cancelar com antecedência (cancelado tarde, fica e o profissional paga a sala); busca de paciente por nome, telefone (só dígitos) ou CPF, com cadastro rápido no próprio agendamento e paginação (fim do corte silencioso em 200); agendar em 1 passo pelo horário vago da grade; lista de espera, que sugere à recepção quem chamar quando um horário abre e baixa sozinha ao agendar. |
| 21/10/2026 | C | Autoatendimento do profissional: valor estimado da reserva pelo próprio contrato antes de reservar (por hora, pacote com o saldo de horas do mês, turno fixo e modelos por atendimento), "Meu contrato" no menu levando direto ao contrato vigente (com o histórico) e resumo no extrato; PIX gerado pelo próprio profissional para o saldo devedor, com QR Code e copia e cola na tela (uma cobrança em aberto por vez, baixa automática pelo webhook). |
| 21/10/2026 | C | Recorrência e impacto: reservas recorrentes semanais, quinzenais (semanas pares contadas do início) e mensais (a N-ª ocorrência do dia, ou a última), com vários dias da semana numa série só (criada e encerrada junta, tudo ou nada em conflito). Feriado novo e sala ou profissional desativado mostram a lista das reservas futuras afetadas, com o número de pacientes; nada é gravado até o admin decidir: manter, ou cancelar pelo espaço (sem cobrança para ninguém) com aviso por WhatsApp ao paciente que aceita e ao profissional (novos templates `cancelamento_agendamento` e `cancelamento_reserva`). |
| 21/10/2026 | C | Cadastro e recibo do paciente: responsável legal (obrigatório para menores de 18), convênio (só registro) e endereço, com validação de CPF do responsável, CEP e UF; os novos dados entram na exportação LGPD e são apagados na anonimização. Recibo do atendimento realizado com valor registrado, emitido pelo profissional (conselho, registro e CPF/CNPJ), em nome do responsável quando houver, com o valor por extenso; impressão ou PDF pelo navegador, com link na lista de atendimentos e no histórico do paciente. |
| 21/10/2026 | C | WhatsApp por QR Code e fechamento em lote: provedor Evolution API (`WHATSAPP_PROVIDER=evolution`), uma instância por espaço, conectada pelo admin em Notificações lendo o QR Code, com aceite registrado do risco de bloqueio; o worker só envia com o número conectado (confere o estado antes) e, desconectado, as mensagens esperam na fila. A Cloud API oficial continua disponível (`meta`). "Fechar o mês de todos" no Financeiro fecha cada profissional na própria transação e lista quem não pôde ser fechado e por quê. **Pendente: testar contra uma Evolution real.** |
| 21/10/2026 | C | Fechamento da Fase C: módulos opcionais por espaço (NFS-e, agendamento online e prontuário), desligados por padrão e ligados na migração para quem já os usava; desligado, o módulo some do menu, as telas e a API dos anexos respondem 404 e a página pública fica indisponível; o prontuário não pode ser desligado com registros (guarda de 20 anos). Plataforma fora do menu do cliente (acesso direto, só superadmin com 2FA). RBAC (C14): só o admin recalcula o mês e ativa/inativa profissional. Exportação CSV do fechamento para a contabilidade. Prévia no extrato da mensalidade e do excedente que ainda entram no fechamento (C12). **Fase C concluída.** |
| 21/10/2026 | D | Primeiros passos no lugar do tour e do manual (removidos): no início do admin, as 7 etapas na ordem de uso (unidade, salas, profissional, contrato, convite, paciente, primeira consulta), com progresso, link de cada uma e a próxima em destaque; some quando tudo estiver feito. Criar a unidade já abre a tela dela para adicionar as salas. |
| 21/10/2026 | D | Navegação: menu agrupado em Operação, Financeiro e Configurações; no desktop, operação e financeiro na barra e configurações num menu suspenso; no celular, gaveta com os três grupos, nome do usuário e sair (fecha ao navegar e com Esc), e cabeçalho numa linha só. |
| 21/10/2026 | D | Início por papel no lugar do painel genérico (sem os indicadores decorativos nem os códigos de auditoria): o admin vê o mês (receita, ocupação, a receber e pendências: mês anterior sem fechar, cobranças vencidas, profissional sem contrato) e o dia; a recepção vê o dia (consultas, na recepção, atrasados, a confirmar, próximos e salas livres agora); o profissional vê a semana (consultas, reservas, saldo com a prévia do fechamento e atalho para o PIX). Saudações pulam títulos ("Dra. Ana" → "Ana"), também no WhatsApp. |
| 21/10/2026 | D | Retorno das ações: no painel, a confirmação de sucesso vira aviso (toast) que não some quando o formulário remonta; erros continuam no formulário. Confirmação de ações destrutivas num diálogo da página (com Voltar e Confirmar) no lugar do `window.confirm`. Rodapé do painel sem a LS Code (só nas páginas públicas), com os documentos legais. |
| 21/10/2026 | D | Máscaras de CPF, CPF/CNPJ, telefone e CEP enquanto se digita, e de valor em R$ ao sair do campo (cadastro de paciente e profissional, onboarding, agendamento online, valor da consulta, pagamentos, ajustes e cobranças). Glossário aplicado: "Chegou" no lugar de presente/check-in/na recepção, "Consultas" no menu e nas telas do dia, "mês" no lugar de competência, "Movimentações", "Quem pagou", "Valor da consulta" e "Intervalo da agenda". |
| 21/10/2026 | D | Marca: tokens de cor de verdade (teal escuro na ação, esmeralda em sucesso, âmbar em atenção, neutros slate) e 193 cores fixas trocadas por tokens; modo escuro removido (era código morto, sem como ativar); fonte de títulos (Plus Jakarta Sans) com Geist no texto; favicon, ícone do app, apple-icon e imagem de compartilhamento (Open Graph) a partir do símbolo do Salus. |
| 21/10/2026 | D | Páginas do paciente: o link da consulta e a agenda online mostram o nome do espaço no topo, texto mais acolhedor ("Sua consulta…", "Não vou poder ir"), "Adicionar à agenda" (.ics com lembrete 2h antes) e "Ver no mapa"; a confirmação do agendamento online também oferece o .ics. A página pública continua sem CPF, telefone ou observações. |
| 21/10/2026 | D | Landing nova para o dono do espaço: proposta de valor (ocupação, inadimplência e tempo da recepção), telas ilustrativas com dados de exemplo, passos para começar, segurança sem jargão técnico e sem preço ("planos pelo número de salas"). O botão "Agendar demonstração" abre o WhatsApp comercial (`SALUS_WHATSAPP_COMERCIAL`); sem a variável, leva ao cadastro. A LS Code fica só no rodapé. **Fase D concluída. Pendente: definir o número do WhatsApp comercial e o preço.** |
| 21/10/2026 | C/D | Sobras de código fechadas: C10 (data da série recorrente que o worker não conseguiu reservar vira pendência para a equipe e e-mail para o profissional), C13 (o "hoje" do espaço é a data local mais atrasada entre as unidades; cron em UTC), C15 (telefone normalizado gerado pelo banco e indexado no agendamento online), relatório do fechamento em PDF, remarcar arrastando a consulta na grade, "Meu dia" do profissional no celular e páginas de convite com o nome do espaço. |

---

## Status atual — 21/10/2026, depois das Fases A a D

**Veredito: pronto para um piloto controlado, ainda não para venda aberta.** O código fez o que o plano pedia nas Fases A a D. O que falta não é mais código: é colocar o sistema no ar com os serviços reais, fazer a revisão jurídica e validar as regras com 1 ou 2 espaços de verdade.

Base desta leitura: `main` depois das sobras de código (C10, C13, C15 e itens de UX), CI verde em cada fase, **476 testes** (unidade + integração com Postgres real), **18 fluxos E2E** no build de produção, teste de backup e restauração no CI e o compose de produção validado localmente (Caddy com TLS, HSTS, worker saudável).

### Pronto para o piloto (feito e testado)

- **Segurança.** Sem senha ou e-mail fixo no código. Login de demonstração só para as contas do seed. Segredos obrigatórios e separados em produção (o boot recusa subir sem eles). CSP com nonce, HSTS e proteção contra iframe. Rate limit no banco. Turnstile no cadastro, na recuperação de senha e no agendamento online. 2FA obrigatório para admin e superadmin. Plataforma fora do menu do cliente.
- **Contas e e-mail.** Confirmação de e-mail obrigatória, redefinição de senha e convites por e-mail, com provedor Resend (e `console` só em demonstração).
- **Operação.** `docker-compose.prod.yml` com Caddy, healthchecks e `/api/health`. Logs estruturados, Sentry no app e no worker, alertas de jobs e da fila de mensagens. Backup diário cifrado (age) com envio externo (rclone) e teste de restauração. Guia em `docs/deploy.md`.
- **LGPD.** Termos, política de privacidade e contato do encarregado, com aceite versionado. Exportação e anonimização do paciente, que cobrem os campos novos. Módulos sensíveis desligados por padrão. Página pública do paciente sem CPF, telefone ou observações.
- **Produto (Fase C).**
  - Contrato unificado: preço, grade fixa e regras de cancelamento por contrato, e é ele que gera a cobrança.
  - Quem cancelou fica registrado.
  - Recepção: remarcar, desfazer status, busca e cadastro rápido de paciente, agendar em um passo, lista de espera.
  - Profissional: preço antes de reservar, "Meu contrato" e PIX do saldo.
  - Recorrência semanal, quinzenal e mensal, com vários dias por série.
  - Feriado e desativação de sala ou profissional mostram as reservas afetadas e esperam a decisão do admin.
  - Paciente com responsável legal, convênio e endereço, e recibo em PDF.
  - WhatsApp por QR Code (Evolution), fechamento em lote com CSV e RBAC da recepção.
- **Experiência e marca (Fase D).**
  - Navegação: primeiros passos no lugar do tour e do manual, menu agrupado, menu no celular e início por papel.
  - Retorno das ações: avisos e diálogo de confirmação.
  - Formulários: máscaras e linguagem simples.
  - Marca: tokens, fonte de títulos, ícones e imagem de compartilhamento.
  - Páginas do paciente com o nome do espaço, "adicionar à agenda" e mapa.
  - Landing nova.

### O que ainda bloqueia o piloto

Nada disto se resolve só com código. Cada item precisa de uma conta, de uma decisão ou de um teste com o serviço real. O roteiro de verificação está no checklist do `docs/deploy.md` (seção 9).

| # | Bloqueio | Estado hoje | O que fazer | Quem |
|---|---|---|---|---|
| P1 | **Servidor (VPS), domínio e HTTPS** | Compose de produção validado só localmente (`https://localhost`) | Contratar a VPS (de preferência na região São Paulo), apontar o DNS, subir com `docs/deploy.md` e conferir `curl -I` com HSTS | Fundador + execução |
| P2 | **E-mail real (Resend)** | Testado com provedor em memória e console; nenhum envio real | Criar a conta, verificar o domínio (SPF, DKIM), definir `RESEND_API_KEY` e `EMAIL_FROM` e fazer um cadastro real até o e-mail chegar | Fundador |
| P3 | **Sentry real** | SDK sobe em produção (E2E com DSN falso) e o envio foi testado com mock | Criar o projeto, definir `SENTRY_DSN`, forçar um erro de teste, criar a regra de alerta e definir `ALERTAS_EMAIL` | Fundador |
| P4 | **Armazenamento S3 e backup externo** | Anexos testados só com armazenamento em memória (o S3 local do compose não tem teste automático); backup e restauração testados no CI com destino local | Criar os buckets (anexos com versionamento; backups com retenção/Object Lock), configurar o rclone, ver o primeiro backup chegar e rodar o `restaurar-teste` | Fundador + execução |
| P5 | **Revisão jurídica** | Termos e política escritos e versionados, mas **não revisados por advogado** | Advogado revisa `app/(legal)`; nomear o encarregado (DPO); contrato com o espaço prevendo o Salus como operador (LGPD art. 39) e listando os suboperadores | Fundador + advogado |
| P6 | **Turnstile real** | Testado com as chaves de teste da Cloudflare (aceita e recusa) | Criar o site no Cloudflare e definir `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` | Fundador |
| P7 | **WhatsApp por QR (Evolution) real** | Testado contra uma Evolution **falsa**; o formato da API (v2) foi conferido na documentação, não numa instância | Subir a Evolution na rede interna do compose, conectar um número **dedicado** do espaço piloto, mandar um lembrete e um aviso de cancelamento de ponta a ponta e acompanhar alguns dias | Execução + espaço piloto |
| P8 | **Identificação legal no ambiente** | Variáveis exigidas pelo boot, sem valores reais | Definir `SALUS_EMPRESA_NOME`, `SALUS_EMPRESA_CNPJ` e `SALUS_ENCARREGADO_EMAIL` | Fundador |

**Não bloqueiam o piloto, mas precisam de decisão:** o número do WhatsApp comercial da landing (`SALUS_WHATSAPP_COMERCIAL`; sem ele, o botão leva ao cadastro) e o preço por sala.

### Riscos que continuam (não impedem o piloto)

- **Integrações que dependem do espaço piloto:**
  - **Asaas (PIX):** testado só com gateway falso e no ambiente simulado. Antes de ligar para um espaço, fazer uma cobrança real no sandbox do Asaas, inclusive o "copia e cola" (`pixQrCode`) e o webhook.
  - **WhatsApp oficial (Meta):** os templates `cancelamento_agendamento` e `cancelamento_reserva` ainda não estão cadastrados. Só importam se o espaço usar a API oficial em vez do QR Code.
  - **NFS-e (Focus) e prontuário:** desligados por padrão. A NFS-e nunca foi testada com a prefeitura real; o prontuário não tem assinatura ICP-Brasil (Fase E).
- **Regras ainda sem validação:**
  - **Regras de negócio são hipóteses.** Cobrança, cancelamento tardio, multa de turno fixo e recorrência foram decididas nesta revisão, sem uso real. O piloto existe para confirmar ou corrigir isso.
- **Dívidas técnicas:**
  - **Sem teste de carga nem pentest externo.** Vale um pentest antes de abrir para venda; para o piloto, os controles atuais bastam.
  - **Modo escuro** foi retirado de propósito e volta depois do piloto, com contraste revisado.

### Ordem sugerida até o primeiro espaço

1. P1, P2, P3, P4, P6 e P8 numa mesma janela: subir o ambiente, passar o checklist do `docs/deploy.md` e restaurar um backup de verdade.
2. P5 em paralelo, porque depende do advogado. Sem ela, não colocar dados reais de pacientes.
3. P7 com o espaço piloto, num número dedicado.
4. Piloto de 2 a 4 semanas com feedback semanal. Pronto quando a recepção passa uma semana sem planilha paralela.

---

## 1. Resumo executivo (diagnóstico de outubro, antes das fases)

**Veredito: o Salus não está pronto para produção.** O estágio real é **protótipo funcional avançado / pré‑piloto**.

- **O que está forte:**
  - O núcleo commitado tem fundação acima da média para o estágio: multi‑tenant com RLS (`FORCE`) e papel de aplicação sem `BYPASSRLS`.
  - Conflitos de horário são impedidos pelo próprio banco (`EXCLUDE … gist`).
  - O ledger é append‑only e idempotente.
  - O prontuário é cifrado e imutável.
  - São 289 testes de integração com Postgres real e E2E com Playwright no CI.
- **O que bloqueia:**
  1. Um grande volume de código **não commitado e escrito por outra IA**: Equipe, Contratos, Plataforma, login demo, recuperação de senha e migrations 0019–0023. Ele tem **falhas de segurança graves** e nunca passou pelo CI.
  2. Não há e‑mail transacional, backup, deploy de produção nem as obrigações básicas da LGPD.
  3. O dia a dia da recepção e do médico ainda é trabalhoso: agendar exige dois formulários, não há remarcação e a escolha de paciente não tem busca.
- **Caminho recomendado:**
  - **A.** Estabilizar o código novo.
  - **B.** Infra e compliance mínimos.
  - **C.** O núcleo de produto que o piloto exige.
  - **D.** UX e marca.

  Conseguir **1–2 espaços piloto** antes de investir pesado na Fase D, porque várias regras ainda são hipóteses.

---

## 2. Premissas de produto (decididas nesta revisão)

| Tema | Decisão |
|---|---|
| Cliente‑alvo | Coworking de saúde de médio porte: 1–3 unidades, 10–40 salas. Ainda sem piloto. |
| Agenda de pacientes | Hoje varia por profissional (Doctoralia, secretária própria…). A meta é **converter todos** para o Salus. |
| Cobrança da sala | Pós‑pago mensal e mensalidade fixa. Ficam 4 modelos: hora/turno, consulta, percentual e mensalidade (com a "sala fixa" como variante). |
| Contrato × acordo | **Unificar: o contrato é o acordo.** Ele define preço, grade fixa e regras, gera as reservas e gera a cobrança. |
| Falta / cancelamento tardio do paciente | **O profissional paga a sala.** |
| Cancelamento de sala pelo profissional | Multa **só para turno fixo** (contrato). O avulso cancela livre. |
| Recepção | Remarca, desfaz status errado, busca e cadastra paciente rápido e gerencia a lista de espera. No financeiro: registra pagamentos, vê extratos e gera cobranças. **Não** fecha o mês, não reprocessa e não desativa profissional. |
| Profissional | Vê o preço antes de reservar, vê o próprio contrato, gera o PIX do que deve e cadastra os próprios pacientes. |
| Paciente | Ganha responsável legal, convênio (só cadastro) e endereço. **Recibo de consulta em PDF.** |
| Recorrência | Semanal, quinzenal, vários dias na mesma regra e mensal (ex.: 1ª segunda). |
| Feriado / desativação | O sistema mostra as reservas e consultas afetadas, e o admin decide: cancelar com aviso ou manter. |
| Fechamento mensal | Continua **irreversível**. Correções vão para o mês seguinte. |
| Multi‑espaço | Uma conta só, com **agenda unificada** entre coworkings. |
| WhatsApp | **Evolution API**: QR Code agora e Cloud API oficial depois, atrás da interface de provedor que já existe. |
| Prontuário | Fica, mas **opcional e desligado por padrão**: feature flag por espaço. |
| Esconder até o piloto | Plataforma (superadmin) fora da navegação do cliente. NFS‑e e agendamento online atrás de flag. Manual e tour trocados por checklist. |
| Plano SaaS | Preço **por número de salas**. |
| Marca LS Code | Assinatura discreta só na landing e no rodapé público. **Nunca** dentro do painel do cliente. |

---

## 3. Status de maturidade (diagnóstico × hoje)

Escala: 1 = inexistente · 2 = protótipo · 3 = funcional com lacunas · 4 = pronto para piloto · 5 = pronto para escala.

| Dimensão | Commitado | Working tree | **Hoje** | Comentário |
|---|:-:|:-:|:-:|---|
| Modelo de dados e regras | **4** | 2 | **4** | Contrato unificado gera a cobrança. Resta validar as regras no piloto. |
| Segurança de aplicação | 3 | **1** | **4** | Sem segredos fixos, CSP, HSTS, rate limit no banco, Turnstile e 2FA. Falta pentest externo. |
| Operação / infra | 2 | 2 | **3** | Compose, backup, Sentry e alertas prontos e testados localmente. Vira 4 com o deploy real (P1–P4). |
| Compliance (LGPD / CFM) | 2 | 2 | **3** | Documentos, aceite, exportação e anonimização prontos. Vira 4 com a revisão jurídica (P5). |
| Funcionalidade (cobertura) | 3 | 3 | **4** | Fase C completa. Módulos extras atrás de chave. |
| UX / usabilidade | 2 | 2 | **4** | Primeiros passos, início por papel, agendar em 1 passo, avisos e linguagem simples. Falta validar com usuários reais. |
| Identidade visual | 2 | 2 | **4** | Tokens, fonte, ícones e páginas do paciente com a marca do espaço. |
| Qualidade / testes | **4** | 2 | **4** | 476 testes e 18 E2E no CI. Sem teste de carga. |
| Documentação | 4 | 2 | **4** | Deploy, revisão e progresso atualizados. |

**Leitura honesta (outubro):** o código commitado chegaria ao nível 4 (piloto) com as Fases A e B. O working tree **regredia** o produto até ser triado.

**Hoje:** o working tree foi triado e todas as dimensões estão em 3 ou 4. As duas que ainda estão em 3 (operação e compliance) sobem com o deploy real e a revisão jurídica, não com mais código.

---

## 4. Review como cliente

### 4.1 Rafaela, dona/administradora do coworking (2 unidades, 22 salas)

> "Gostei de saber que duas pessoas nunca vão reservar a mesma sala: o sistema simplesmente não deixa. O extrato por profissional é claro e o fechamento me dá segurança.
>
> Mas para começar a usar eu passei por umas **7 telas e ~36 campos** sem ninguém me dizer a ordem. Criei a unidade e fiquei olhando uma mensagem cinza, sem botão para ir cadastrar as salas. O preço da sala aparece em **três lugares**: na sala, no 'acordo financeiro' e no 'contrato'. Não sei qual vale. Descobri depois que o contrato nem cobra.
>
> O fechamento é **profissional por profissional**: com 30 locatários, são 30 cliques e 30 confirmações do navegador. Não tenho exportação para a minha contadora.
>
> Quando cadastro um feriado, as reservas daquele dia continuam lá como se nada tivesse acontecido. Quando desligo um profissional, os pacientes dele continuam recebendo lembrete.
>
> E me assustou ver que a recepcionista consegue 'reprocessar o mês' e desativar um médico. Isso é meu.
>
> Por fim: o site diz 'conformidade total com a LGPD', mas se um paciente pedir para apagar os dados dele, eu não tenho como fazer."

### 4.2 Juliana, secretária da recepção

> "A grade de salas é bonita, mas tem informação demais em cada quadradinho, com emoji e etiqueta minúscula.
>
> O menu tem 10 itens numa linha só. No celular ele rola de lado e eu nem percebo que existem mais itens. A tela inicial não me mostra **quem chega hoje**, que é a única coisa que eu preciso de manhã.
>
> Para marcar um paciente pela grade eu preencho **dois formulários**: primeiro reservo a sala, depois clico na reserva e agendo o paciente. A lista de pacientes é um dropdown **sem busca**, e um dia o paciente nº 201 simplesmente não apareceu (o sistema corta em 200 e não avisa). Se o paciente é novo, tenho que sair da tela, cadastrar e voltar, e perco o horário que tinha escolhido.
>
> Paciente liga para mudar o horário? **Não existe remarcar.** Eu cancelo e crio de novo, e se for em cima da hora o sistema cobra multa do médico como se o paciente tivesse cancelado. Cliquei 'Falta' sem querer? **Não tem como desfazer.**
>
> O botão 'Registrar Pagamento' na verdade só grava o valor da consulta. E eu não sei o que é 'competência', 'lançamento' ou 'reprocessar'."

### 4.3 Dr. Marcos, psiquiatra que aluga salas em dois espaços

> "Reservar a sala é rápido e a recorrência semanal ajuda. Mas eu **não vejo quanto vou pagar** antes de reservar, e também não consigo ver o meu próprio acordo.
>
> Atendo quinzenalmente às quintas e em dois dias da semana: a recorrência só é semanal e com um dia por regra. Quando a recorrência encontra conflito, ela pula a data e **ninguém me avisa**. Descobri na hora de atender.
>
> No celular a grade é inutilizável: são colunas de salas com rolagem lateral. Eu queria uma lista do meu dia.
>
> Vejo o meu saldo, mas não consigo **gerar o PIX** sozinho, preciso pedir à recepção. E no meio do mês o saldo parece menor do que é, porque a mensalidade só entra no fechamento.
>
> Trabalho em dois coworkings: tenho que trocar de espaço para ver cada agenda, e nada me impede de marcar dois pacientes no mesmo horário em lugares diferentes.
>
> O prontuário é sério: cifrado, com adendo. Mas ainda uso outro sistema, porque falta modelo de evolução e receita digital. E não quero que ele apareça para quem não usa."

---

## 5. Erros identificados e propostas de solução

Prioridade: **P0** = bloqueia produção/segurança · **P1** = bloqueia o piloto · **P2** = importante.

### 5.1 Segurança (sobretudo no código não commitado)

| # | Erro | Impacto | Evidência | Solução | P |
|---|---|---|---|---|:-:|
| S1 | Login demo faz `signInEmail` com a senha fixa `salus-dev-123` para **qualquer e‑mail** sempre que `NODE_ENV≠production` ou `SALUS_DEMO=true`, sem rate limit | Com o demo ligado, qualquer conta com a senha de seed é tomada, inclusive o superadmin | `app/(auth)/entrar/actions.ts` | Remover do build de produção. Em dev, aceitar só os e‑mails do seed (`*.salus.dev`). O painel demo só aparece em dev | P0 |
| S2 | Superadmin com e‑mail fixo no código (`felipe@lscode.claude`) e senha padrão | Conta com o maior privilégio previsível | `src/db/scripts/promover-superadmin.ts`, `entrar/actions.ts` | E‑mail só por env (`PLATFORM_OWNER_EMAILS`), senha gerada e impressa uma vez, 2FA obrigatório, rota `/plataforma` fora do app do cliente | P0 |
| S3 | O reset de senha só loga a URL, com o token, e a tela diz "instruções enviadas" | O usuário nunca recebe o link e o token fica nos logs | `src/auth/config.ts:15-18`, `app/(auth)/recuperar-senha` | Provedor de e‑mail (Resend/SES). Nunca logar o token | P0 |
| S4 | Sem verificação de e‑mail | O aceite de convite compara e‑mail, e sem verificação isso não prova nada: dá para sequestrar o convite | `src/auth/config.ts`, migration `0023` | `requireEmailVerification` + e‑mail de verificação | P0 |
| S5 | `SECRETS_KEY` e `LINKS_SECRET` caem no `BETTER_AUTH_SECRET` também em produção | Rotacionar o segredo de sessão torna ilegível todo o prontuário e todos os tokens | `src/server/cripto.ts:13-15`, `src/server/links.ts:16` | Em produção, exigir as três variáveis distintas e validar o env no boot (zod) | P0 |
| S6 | O worker no compose não recebe `BETTER_AUTH_SECRET`, e `SECRETS_KEY` e `LINKS_SECRET` são vazios por padrão | O worker falha ao gerar links de lembrete e ao decifrar o token da Focus | `docker-compose.yml:78-85` | Bloco de env compartilhado entre app e worker, sem defaults vazios | P0 |
| S7 | Sem headers de segurança (CSP, HSTS, `frame-ancestors`, Referrer‑Policy) | Clickjacking no painel e no prontuário | `next.config.ts` | `headers()` no Next ou no Caddy | P0 |
| S8 | Rate limit em memória e IP não confiável. Páginas públicas sem captcha | Força bruta no login. Um robô lota a agenda pública variando o celular | config do Better Auth, `src/server/agendamento-online.ts` | `rateLimit.storage: "database"`, `ipAddress` do proxy, Turnstile no `/agendar` | P1 |
| S9 | `trustedOrigins` sempre inclui localhost | Superfície desnecessária em produção | `src/auth/config.ts:38-39` | Só em dev | P2 |
| S10 | Upload confia no MIME do cliente e lê o corpo inteiro antes de checar o tamanho | Arquivo disfarçado; pressão de memória | `app/api/prontuario/anexos/route.ts` | Conferir os bytes mágicos e limitar o stream | P2 |
| S11 | Sem 2FA nem expiração por inatividade | Risco para admin, prontuário e superadmin | auth | Plugin `twoFactor`; sessão curta para papéis sensíveis | P1 |

### 5.2 Corretude e regras de negócio

| # | Erro | Impacto | Evidência | Solução | P |
|---|---|---|---|---|:-:|
| C1 | O contrato de locação **não gera cobrança**: grava valor e regras, mas nunca cria o acordo | O admin acha que cobrou e não cobrou | `src/server/contratos.ts` | **Unificar contrato e acordo** (seção 7) | P0 |
| C2 | Erro da materialização do contrato é engolido **dentro da transação aberta** | Uma falha do Postgres deixa a transação abortada, e o insert seguinte (auditoria) estoura, ou o contrato fica sem reservas sem aviso | `src/server/contratos.ts:276-283` | Savepoint por ocorrência ou falha explícita, com a lista de conflitos mostrada ao usuário | P0 |
| C3 | A materialização do contrato "adota" reservas já existentes do profissional | Reservas avulsas viram contrato sem ninguém pedir | `src/server/reservas.ts:223-244` | Só vincular com confirmação; nunca em silêncio | P1 |
| C4 | `Promise.all` dentro de transação | Aviso do `pg`, que vira erro no pg@9; ordem não determinística | `assinatura.ts:31,65`, `unidades.ts:295,336` | Executar em sequência | P0 |
| C5 | Listas com `.limit(200)` sem paginação nem aviso | O paciente nº 201 some da agenda | `src/server/pacientes.ts:180` (e outros) | Busca no servidor (nome/telefone/CPF) + paginação por cursor | P1 |
| C6 | Cancelamento tardio é sempre "do paciente" e cobra o profissional, mesmo quando foi o espaço ou a recepção que cancelou | Cobrança injusta, conflito com o locatário | `src/domain/financeiro.ts:164-176` | Registrar **quem cancelou** (paciente / profissional / espaço). Só cobra quando foi o paciente ou o profissional | P1 |
| C7 | Prazo de cancelamento é único por tenant, mas a documentação diz que é por acordo | Não atende quem tem regras diferentes | `schema.ts` (`tenant_settings`), `agendamentos.ts:228` | O prazo passa a fazer parte do contrato | P1 |
| C8 | Sem remarcação: cancelar e recriar aplica multa indevida e perde o histórico | Prejuízo e retrabalho | `src/server/agendamentos.ts` | `remarcarAgendamento` (move período/sala, mantém o id e o histórico, sem multa dentro da regra) | P1 |
| C9 | Status finais irreversíveis (realizado, falta, cancelado) | Um clique errado vira lançamento financeiro | `src/domain/agendamentos.ts:19-26` | "Desfazer" por até 24h ou até o fechamento, com auditoria e reprocessamento | P1 |
| C10 | Recorrência pula datas em conflito só com uma linha de auditoria | O profissional perde o horário sem saber | `src/server/reservas.ts:455-463` | Notificar o profissional e o admin, e mostrar as "datas não garantidas" na tela | P1 |
| C11 | Feriado novo e desativação de profissional ignoram reservas e consultas futuras | Lembretes e cobranças indevidos | `unidades.ts:155-171`, `profissionais.ts:98-130` | Tela de impacto com decisão do admin (cancelar com aviso / manter) | P1 |
| C12 | Mensalidade e excedente só entram no fechamento | O saldo do meio do mês engana o profissional | `financeiro.ts:483` | Projeção "a fechar" no extrato | P2 |
| C13 | Fusos misturados: tenant no fechamento, unidade nos lançamentos e cron fixo em São Paulo | Erros de mês e de horário com unidades em fusos diferentes | `financeiro.ts:444`, `:260`, `worker/index.ts:73` | Fuso da unidade como fonte única; o cron roda em UTC e calcula por unidade | P2 |
| C14 | A recepção pode reprocessar o mês e desativar profissional | Poder acima do papel | `financeiro.ts:391`, `profissionais.ts:104` | Ajustar o RBAC às premissas (seção 2) | P1 |
| C15 | O agendamento público carrega **todos** os pacientes com telefone a cada envio | Lento e amplifica abuso | `agendamento-online.ts:248-249` | Coluna de telefone normalizado com índice | P2 |
| C16 | Agendar num horário vazio reserva a sala em silêncio. Se o paciente cancela, a reserva fica e é cobrada | Cobrança de sala não usada | `agendamentos.ts:140-154` | Reserva criada pelo agendamento é liberada junto, com regra explícita | P1 |

### 5.3 Operação e compliance

| # | Lacuna | Solução | P |
|---|---|---|:-:|
| O1 | **Sem backup** do Postgres nem do S3 | `pg_dump` diário + WAL/PITR, cópia externa criptografada, **restauração testada** todo mês | P0 |
| O2 | Sem deploy de produção. O compose é de dev: senhas padrão, HTTP, sem `restart` | `docker-compose.prod.yml` com Caddy (TLS), segredos por env, `restart`, healthchecks e limites | P0 |
| O3 | Sem `/api/health`, sem Sentry, logs sem estrutura. O worker engole erros e loga a cada minuto | Health check (banco + S3), Sentry no app e no worker, logs JSON, alerta para job e outbox com falha | P1 |
| O4 | **Nenhum e‑mail transacional** | Resend (ou SES): verificação, reset, convites, extrato mensal | P0 |
| O5 | LGPD: sem anonimização, sem exportação do titular, sem política/termos/encarregado, sem aceite no cadastro | Implementar os direitos do titular, as páginas legais e o aceite versionado. Corrigir o marketing | P0 |
| O6 | Prontuário sem retenção garantida de 20 anos (CFM) | S3 com versionamento + Object Lock, backup com retenção longa, política documentada | P1 (se o prontuário for ligado) |
| O7 | Worker e migrate rodam como root com devDependencies (`tsx`) | Build do worker em JS, imagem enxuta, usuário não root | P2 |
| O8 | Dependências: pacote `cn` (risco de supply chain), CLI `shadcn` em produção, `@types/node` 20 com engine 22 | clsx + tailwind-merge, mover a CLI para dev, Dependabot e `npm audit` no CI | P2 |

### 5.4 Documentação divergente

- O README fala em 4 modelos de cobrança, mas o código tem 5 (`sala_fixa`). O README também promete uma anonimização que não existe.
- A ADR‑03 ("UI limita a um tenant") é contradita pelo seletor de clínicas.
- Contratos, Equipe e Plataforma não estão no plano nem no modelo de dados documentado.
- A landing diz "Conformidade total com a LGPD" (`app/page.tsx:103`) e expõe jargão técnico ("Row Level Security", "Ativo (GIST)").

---

## 6. Usabilidade e cadastro: propostas

1. **Checklist de primeiro uso** no lugar do tour e do manual: Unidade → Salas → Contrato do profissional → Convite → Primeiro paciente → Primeira consulta.
   - Mostra o progresso e tem um botão para cada etapa.
   - Cada criação leva à próxima tela: criou a unidade, já abre "adicionar salas".
2. **Agendar em um passo.** Clicar no horário abre um painel com profissional, paciente, duração e observação. A sala é reservada junto quando necessário. A meta é **3 cliques**.
3. **Paciente:**
   - Combobox com busca por nome, telefone e CPF, e **"+ novo paciente"** inline (nome e telefone bastam).
   - Máscaras de CPF, telefone e moeda.
   - Novos campos: responsável legal, convênio e endereço.
4. **Remarcar** por ação dedicada (e, depois, arrastando na grade). **Desfazer** status com prazo.
5. **Lista de espera** por profissional e faixa de horário. Quando um horário abre, a recepção recebe uma sugestão.
6. **Dashboard por papel:**
   - **Recepção, "Hoje":** chegadas, atrasos, confirmações pendentes e salas livres agora.
   - **Médico, "Minha semana":** consultas, reservas, saldo e "pagar agora".
   - **Admin, "Mês":** ocupação, receita, inadimplência e pendências de fechamento.
7. **Navegação:**
   - Menu agrupado (Operação · Financeiro · Configurações), com no máximo 6 itens visíveis por papel.
   - **Menu mobile** em gaveta.
   - Itens de módulos desligados não aparecem.
8. **Médico no celular:** visão de lista do dia e da semana (cards) no lugar da grade de colunas.
9. **Feedback:** toasts e diálogo de confirmação com descrição do impacto no lugar de `window.confirm`. Os botões pendentes dizem o que estão fazendo.
10. **Fechamento em lote:** "Fechar setembro para todos", com relatório de pendências e exportação CSV/PDF para a contabilidade.
11. **Profissional:** preço estimado ao reservar, tela "Meu contrato", "Pagar agora (PIX)" no extrato e recibo do paciente em PDF a partir do atendimento.
12. **Glossário de linguagem**, aplicado em todas as telas:

| Hoje | Proposta |
|---|---|
| Competência | Mês de referência / "Setembro" |
| Lançamento / Lançar ajuste | Movimentação / Ajuste |
| Reprocessar mês | Recalcular mês |
| Presente / Na recepção / Check‑in | **Chegou** |
| Atendimento / Agendamento / Consulta | **Consulta** (único termo) |
| Sentido (pagamento) | "Quem pagou" |
| Slot | Intervalo da agenda |
| "Registrar Pagamento" (no valor) | "Valor da consulta" |

---

## 7. O que retirar, unificar ou esconder

| Item | Ação | Motivo |
|---|---|---|
| **Contratos + Acordos** | **Unificar** num "Contrato do profissional" versionado: modelo, valores, grade fixa (opcional), prazo e multa de cancelamento, vigência | Hoje são três fontes de preço e a que parece principal não cobra |
| `sala_fixa` | Virar variante da **mensalidade** (turno fixo × pacote de horas) | Sobrepõe a mensalidade |
| Plataforma (superadmin) | Sair da navegação e do login do cliente. App ou rota separada, só por env, com 2FA | Risco e ruído |
| Login demo | Só em dev, com e‑mails de seed | Falha S1 |
| Manual de 520 linhas + tour de 5 slides | Remover. Checklist e ajuda contextual (ícone "?" por tela) | Ninguém lê, e o tour vende em vez de ensinar |
| NFS‑e, agendamento online e prontuário | **Feature flags por espaço**, desligados por padrão | Menos tela e menos risco regulatório até o piloto pedir |
| Jargão técnico na landing e no painel ("GIST", "RLS", "tenant", "D‑1", "console") | Retirar | O cliente não compra arquitetura |
| "Conformidade total com a LGPD" | Retirar até a Fase B | Risco jurídico |
| Selo LS Code dentro do painel | Só na landing e no rodapé público | A marca do cliente é o Salus |
| Emojis como ícones | Lucide | Consistência e acessibilidade |
| Pacote `cn` | clsx + tailwind‑merge | Supply chain |

---

## 8. Identidade visual

- **Tokens de verdade.** Hoje o `:root` é o cinza neutro do shadcn, e só o `--primary` é teal (`app/globals.css`). Proposta:
  - primária teal‑escuro (ação/confiança);
  - esmeralda para sucesso/financeiro;
  - fundos slate claros (fadiga menor na recepção);
  - âmbar para atenção e vermelho só para destrutivo;
  - nenhuma cor fixa em componente.
- **Dark mode:** hoje é código morto (não há toggle). Decidir entre implementar com `next-themes` e revisar os contrastes, ou remover. Recomendação: **remover agora** e voltar depois do piloto.
- **Ícones da marca:** favicon, `icon`/`apple-icon` e Open Graph a partir de `public/images/salus-symbol.webp`. O favicon ainda é o padrão do Next.
- **Tipografia:** uma fonte de títulos com personalidade (ex.: uma humanista) mais Geist no texto.
- **Consistência:** um único padrão de card, tabela e lista vazia. O dashboard usa gradientes e "glow" e o CRUD é shadcn puro. Escolher o sóbrio e aplicar em todo lugar.
- **Páginas do paciente** (`/agendar`, `/c/[token]`, convite): nome e logo do espaço, endereço com link de mapa, "adicionar ao calendário" (.ics) e linguagem acolhedora. Hoje são cartões crus.
- **Landing:** prints reais, proposta de valor para o dono do espaço (ocupação, inadimplência, tempo da recepção), preço por sala e CTA de demonstração agendada.

---

## 9. Plano de evolução

### Fase A — Estabilizar (1–2 semanas)
**Objetivo:** levar o working tree ao nível do código commitado.
- **Triagem** do código não commitado, em commits pequenos pelo CI: (1) auth/reset/perfil, (2) equipe e convites, (3) plataforma, (4) contratos, (5) UI. Descartar o que não passar.
- Corrigir S1, S2, S5, S6, C2 e C4. Contratos ficam **desligados** até a Fase C.
- Atualizar o README, as ADRs (multi‑espaço, contrato) e o modelo de dados.

**Pronto quando:** o working tree está limpo, o CI passa e não existe senha ou e‑mail fixo no código.

### Fase B — Pronto para piloto: infra e compliance (3–4 semanas)
- **E‑mail** (Resend): verificação obrigatória, reset, convites de equipe e de profissional.
- **Env** validado no boot, sem fallbacks em produção. Headers de segurança. Rate limit persistente. Turnstile nas páginas públicas. 2FA para admin e superadmin.
- **Deploy:**
  - `docker-compose.prod.yml` com Caddy, `restart` e healthchecks, mais `/api/health`;
  - Sentry e logs estruturados;
  - alertas da outbox e dos jobs.
- **Backup:** `pg_dump` diário, WAL, cópia externa, restauração testada. S3 com versionamento.
- **LGPD:**
  - política de privacidade, termos e encarregado;
  - aceite versionado no cadastro;
  - **anonimização e exportação** do titular;
  - marketing corrigido.
- Feature flags por espaço (NFS‑e, agendamento online, prontuário). Plataforma fora do app do cliente.

**Pronto quando:** um espaço consegue se cadastrar sozinho em produção, recuperar a senha por e‑mail e ter os dados restaurados de um backup.

### Fase C — Núcleo de produto para o piloto (4–6 semanas)
- **Contrato unificado:**
  - modelos, grade fixa e reservas geradas;
  - prazo e multa de cancelamento por contrato, com multa só para turno fixo;
  - o mesmo contrato gera a cobrança;
  - migração dos acordos existentes.
- **Quem cancelou** (C6). Liberação da reserva criada pelo agendamento (C16).
- **Recepção:** remarcar, desfazer status, lista de espera, busca de paciente com paginação, cadastro rápido, agendar em 1 passo.
- **Profissional:**
  - preço antes de reservar e "Meu contrato";
  - **PIX gerado por ele mesmo**;
  - projeção do saldo;
  - recibo do paciente em PDF.
- **Recorrência** quinzenal, de vários dias e mensal, com aviso de conflito (C10).
- **Impacto de feriado e desativação** com decisão do admin (C11).
- **Paciente:** responsável legal, convênio e endereço.
- **WhatsApp via Evolution API (QR):**
  - provedor novo na interface existente;
  - conexão por espaço, com status do número;
  - aviso do risco de bloqueio no aceite.
- **Fechamento em lote** com exportação CSV/PDF.
- RBAC ajustado às premissas (C14).

**Pronto quando:** a recepção de um espaço piloto passa uma semana sem planilha paralela.

### Fase D — UX e marca (paralela ao piloto, 3–4 semanas)
- Checklist de primeiro uso, dashboards por papel, menu agrupado e mobile, visão de lista para o médico.
- Toasts e diálogos, máscaras, glossário aplicado.
- Tokens de marca, ícones, tipografia, páginas do paciente, landing nova.

**Pronto quando:** um admin novo chega à primeira consulta em menos de 15 minutos sem ajuda.

### Fase E — Pós‑piloto (sob demanda dos pilotos)
- **Agenda unificada multi‑espaço** do profissional, com bloqueio de conflito entre espaços.
- WhatsApp pela Cloud API oficial (Evolution ou direto).
- Religar NFS‑e e agendamento online para quem pedir.
- Prontuário: modelos de evolução por especialidade, Memed, assinatura ICP‑Brasil.
- Preço do SaaS por sala no Asaas, com suspensão automática por inadimplência.
- Receita Saúde (recibo oficial do profissional pessoa física).

---

## 10. Recomendações para decidir

- **Deploy:**
  - Começar com **uma VPS** (2–4 vCPU, 8 GB) com Docker Compose e Caddy.
  - Postgres no próprio host, com backup criptografado para um storage externo, e S3 gerenciado (R2/S3) com versionamento para os anexos.
  - Migrar o banco para um serviço gerenciado a partir de cerca de 5 clientes pagantes.
  - Sobre a região: hospedar fora do Brasil é permitido pela LGPD, mas exige cláusulas de transferência internacional. Com prontuário ligado, **preferir região Brasil** (São Paulo).
- **Monetização:**
  - **Coworking paga por sala ativa**, com faixa mínima.
  - Profissional usa de graça no início, porque é ele quem leva os pacientes para dentro.
  - Avaliar extras pagos pelo profissional (prontuário, agenda online, lembretes ilimitados) só depois do piloto.
- **WhatsApp por QR:**
  - O custo por mensagem é zero, mas o número pode ser bloqueado. Isso precisa estar explícito no aceite.
  - Ter fallback por e‑mail para lembretes críticos.
  - Planejar a migração para a API oficial quando um cliente exigir.
- **Piloto:** vale mais que qualquer item da Fase D. Recomendo oferecer a Fase B/C pronta a 1–2 espaços em troca de feedback semanal.

---

## 11. Dúvidas ainda em aberto

1. Preço do SaaS: valor por sala, faixa mínima e período de teste.
2. Quem arca com o custo do WhatsApp quando migrar para a API oficial: o espaço ou o Salus?
3. Região de hospedagem (Brasil × exterior), que depende de o prontuário ser ligado no piloto.
4. ~~O recibo sai no nome de quem?~~ **Decidido:** sempre no nome do profissional. No caixa centralizado, o recibo informa que o espaço recebeu em nome dele.
5. ~~A lista de espera avisa o paciente sozinha?~~ **Decidido:** não. Ela só sugere à recepção quem chamar.
6. Na agenda unificada multi‑espaço, um espaço pode ver que o profissional está ocupado em outro? (Privacidade entre clientes concorrentes.)
7. Número do WhatsApp comercial da landing (`SALUS_WHATSAPP_COMERCIAL`).
8. Qual espaço será o primeiro piloto e com qual número dedicado ele vai usar o WhatsApp por QR Code.
