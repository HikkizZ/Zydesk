-- Roles y bases de desarrollo (ADR 0017). Postgres lo ejecuta solo al crear el volumen.
CREATE ROLE zydesk_owner LOGIN PASSWORD 'zydesk_owner';
CREATE ROLE zydesk_app   LOGIN PASSWORD 'zydesk_app';

-- base de desarrollo (POSTGRES_DB=zydesk ya existe) y base de test
CREATE DATABASE zydesk_test OWNER zydesk_owner;
ALTER DATABASE zydesk OWNER TO zydesk_owner;
-- pg-boss (corre como zydesk_app) ejecuta CREATE SCHEMA IF NOT EXISTS al iniciar, que exige CREATE en la base
GRANT CREATE ON DATABASE zydesk TO zydesk_app;
GRANT CREATE ON DATABASE zydesk_test TO zydesk_app;

\c zydesk
ALTER SCHEMA public OWNER TO zydesk_owner;
GRANT USAGE ON SCHEMA public TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO zydesk_app;

\c zydesk_test
ALTER SCHEMA public OWNER TO zydesk_owner;
GRANT USAGE ON SCHEMA public TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zydesk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zydesk_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO zydesk_app;
