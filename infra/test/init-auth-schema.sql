-- GoTrue expects its schema to exist before it runs its own migrations into it.
-- Postgres runs this once, on first initialisation of the data directory.
CREATE SCHEMA IF NOT EXISTS auth;
