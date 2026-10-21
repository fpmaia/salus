-- A verificação de e-mail passou a ser obrigatória para entrar (src/auth/config.ts).
-- Contas criadas antes disso nunca receberam o link: são consideradas verificadas para não
-- ficarem trancadas. Contas novas seguem o fluxo de confirmação.
UPDATE users SET email_verified = true WHERE email_verified = false;
