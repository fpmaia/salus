# Deploy de produção

Uma VPS com Docker roda tudo pelo `docker-compose.prod.yml`:

- **Caddy:** TLS automático e o IP real do cliente.
- **Postgres 16:** sem porta exposta.
- **migrate:** aplica as migrations antes de app e worker subirem.
- **App Next.js e worker pg-boss.**
- **backup:** backup diário cifrado, enviado para fora do servidor.

Os anexos do prontuário ficam num S3 gerenciado (Cloudflare R2, AWS S3 etc.), não na VPS.

## 1. Pré-requisitos

- **VPS:** Linux, 2–4 vCPU, 8 GB de RAM, Docker e Docker Compose v2.
  - Com o prontuário ligado, prefira região Brasil (LGPD: transferência internacional exige cláusulas específicas).
- **Domínio** com registro A/AAAA apontando para a VPS. Portas 80 e 443 abertas, para o Let's Encrypt e o HTTPS.
- **E-mail:** conta no [Resend](https://resend.com) com o domínio verificado (SPF/DKIM).
- **Turnstile:** um site no [Cloudflare Turnstile](https://dash.cloudflare.com), que fornece as chaves pública e secreta.
- **Dois buckets S3:**
  - **Anexos:** versionamento ligado.
  - **Backups:** em **outra conta ou provedor**. Ligue retenção/Object Lock: o CFM exige guardar o prontuário por 20 anos.
- **Chaves age para os backups:** gere fora do servidor, com `age-keygen -o salus-backup.key`.
  - O servidor recebe só a **chave pública** (`age1…`).
  - A privada fica guardada num cofre de senhas, junto com a `SECRETS_KEY`.

> **Guarde a `SECRETS_KEY` fora do servidor.** Ela cifra as chaves de dados de cada espaço, que por sua vez cifram o prontuário e os tokens de integração. Um backup restaurado sem ela tem o conteúdo clínico ilegível.

## 2. Variáveis (`.env.producao`)

Crie o arquivo na VPS, fora do controle de versão, com `chmod 600`. Gere os segredos com `openssl rand -base64 32`: um diferente para cada.

```dotenv
DOMINIO=app.seudominio.com.br
ACME_EMAIL=ops@seudominio.com.br
SALUS_VERSAO=2026.10.1

POSTGRES_PASSWORD=
SALUS_OWNER_PASSWORD=
SALUS_APP_PASSWORD=

BETTER_AUTH_SECRET=
LINKS_SECRET=
SECRETS_KEY=

RESEND_API_KEY=
EMAIL_FROM=Salus <nao-responda@seudominio.com.br>
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Anexos do prontuário (ex.: Cloudflare R2)
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_BUCKET=salus-anexos
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PROVIDER=Cloudflare

# Backups (outro provedor/conta)
BACKUP_AGE_RECIPIENT=age1...
BACKUP_DESTINO=destino:salus-backups
BACKUP_S3_PROVIDER=AWS
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGIAO=sa-east-1
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
```

Opcionais: `WHATSAPP_*`, `ASAAS_*`, `BACKUP_RETENCAO_DIARIO` (padrão `35d`) e `BACKUP_INTERVALO_SEGUNDOS` (padrão 1 dia).

Variável obrigatória ausente faz o `docker compose` recusar subir. Segredo inválido (curto, repetido, `SECRETS_KEY` sem 32 bytes, e-mail em modo `console`) faz o app e o worker recusarem o boot (`src/env.ts`).

## 3. Subir

```bash
git clone https://github.com/<org>/salus.git && cd salus
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.producao ps
```

A ordem de subida é db (saudável) → migrate (aplica e sai) → app (saudável no `/api/health`) → Caddy. O worker e o backup sobem em paralelo ao app.

Depois de subir:
- **Superadmin:**

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migrate npm run plataforma:promover -- voce@seudominio.com.br
  ```

  A senha inicial aparece uma única vez no terminal.
- **Health check:** `https://<DOMINIO>/api/health` devolve `{"status":"ok","banco":true,...}`. Aponte um monitor externo (UptimeRobot, Better Stack) para ele.

## 4. Atualizar

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
```

O `migrate` roda de novo antes de o app novo subir. As migrations são só de avanço: para voltar uma versão, restaure o backup anterior à atualização.

## 5. Healthchecks

| Serviço | Saudável quando |
|---|---|
| db | `pg_isready` responde |
| app | `/api/health` devolve 200 (o banco responde) |
| worker | o worker tocou `/tmp/salus-worker-vivo` nos últimos 2 min (a cada 30 s, enquanto o banco responde) |
| backup | houve backup bem-sucedido nas últimas 26 h |
| Caddy | só encaminha para o app enquanto o `/api/health` dele responde |

Todos os serviços usam `restart: unless-stopped`, e os logs rodam em json-file (10 MB × 5 por serviço).

## 6. Backups

O serviço `backup` roda ao subir e depois a cada 24 h. Cada execução:

1. Faz `pg_dump -Fc` do banco, como `salus_owner`, que tem BYPASSRLS e vê todos os espaços. O schema `pgboss` (a fila do worker) fica de fora: ele é transitório, e o worker o recria ao subir.
2. Grava um **manifesto** com contagens: tenants, usuários, agendamentos, lançamentos, prontuário, auditoria e migrations.
3. Cifra o dump com **age** para a chave pública. O servidor não consegue ler o próprio backup.
4. Envia por **rclone** para `BACKUP_DESTINO`:
   - `postgres/diario/` fica pelo tempo de `BACKUP_RETENCAO_DIARIO`;
   - `postgres/mensal/` recebe uma cópia no dia 1º e **nunca é apagada pelo script** (use a retenção do bucket).
5. Copia os anexos do bucket do app para `anexos/` **sem nunca apagar no destino**. Os arquivos já estão cifrados pelo app.

A execução manual é com `docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm backup backup`.

### Teste de restauração (todo mês)

O teste baixa o último backup, decifra, restaura num banco temporário (`salus_restauro_teste`) do mesmo servidor e confere as contagens contra o manifesto. No fim, apaga o banco temporário.

A chave privada entra só durante o teste:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm \
  -v /caminho/seguro/salus-backup.key:/chaves/chave.txt:ro \
  -e PGUSER=postgres -e PGPASSWORD="$POSTGRES_PASSWORD" -e AGE_IDENTITY_FILE=/chaves/chave.txt \
  backup restaurar-teste
```

A saída esperada é `[restauro] OK: contagens conferem {...}`. O CI roda o mesmo ciclo a cada push (`scripts/testar-backup.sh`).

### Restauração de verdade (desastre)

1. Suba só o `db` num servidor novo, com o mesmo `.env.producao`. O init cria os papéis `salus_owner` e `salus_app`.
2. Baixe e decifre o dump:

   ```bash
   rclone copyto destino:salus-backups/postgres/diario/<arquivo>.dump.age salus.dump.age
   age -d -i salus-backup.key -o salus.dump salus.dump.age
   ```

3. Restaure, recriando o banco `salus`:

   ```bash
   docker compose ... exec -T db pg_restore -U postgres --clean --if-exists -d salus < salus.dump
   ```

4. Restaure os anexos para o bucket do app com `rclone copy destino:salus-backups/anexos origem:<bucket>`.
5. Suba o resto da stack com a **mesma `SECRETS_KEY`**.

## 7. Checklist antes do primeiro cliente

- [ ] DNS, HTTPS e HSTS: `curl -I https://<DOMINIO>` mostra `strict-transport-security`.
- [ ] Cadastro real: o e-mail de confirmação chega (Resend) e o Turnstile aparece.
- [ ] Superadmin criado; a senha inicial foi trocada.
- [ ] O primeiro backup aparece no destino e o `restaurar-teste` deu OK.
- [ ] `SECRETS_KEY` e a chave privada age estão guardadas fora do servidor.
- [ ] Monitor externo aponta para `/api/health`.
- [ ] Bucket de backups com retenção/Object Lock; bucket de anexos com versionamento.
