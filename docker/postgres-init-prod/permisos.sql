-- Propiedad y permisos de la base de Zydesk (ADR 0017). Compartido por 01-roles.sh (primer arranque) y por
-- restaurar.sh (tras recrear la base). Idempotente. Se ejecuta conectado a la base de la app, con los roles
-- zydesk_owner y zydesk_app ya creados y la variable psql BD = nombre de esa base.
ALTER DATABASE :"BD" OWNER TO zydesk_owner;
-- pg-boss (corre como zydesk_app) ejecuta CREATE SCHEMA IF NOT EXISTS al iniciar, que exige CREATE en la base
GRANT CREATE ON DATABASE :"BD" TO zydesk_app;
ALTER SCHEMA public OWNER TO zydesk_owner;
GRANT USAGE ON SCHEMA public TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO zydesk_app;
