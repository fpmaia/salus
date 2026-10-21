-- Contagens gravadas junto com cada backup e conferidas na restauração (restaurar-teste.sh).
-- Uma linha, JSON com chaves em ordem fixa: a comparação é textual.
select json_build_object(
  'migrations', (select count(*) from drizzle.__drizzle_migrations),
  'tenants', (select count(*) from tenants),
  'users', (select count(*) from users),
  'profissionais', (select count(*) from profissionais),
  'pacientes', (select count(*) from pacientes),
  'reservas_sala', (select count(*) from reservas_sala),
  'agendamentos', (select count(*) from agendamentos),
  'lancamentos', (select count(*) from lancamentos),
  'registros_clinicos', (select count(*) from registros_clinicos),
  'chaves_tenant', (select count(*) from chaves_tenant),
  'audit_log', (select count(*) from audit_log)
)::text;
