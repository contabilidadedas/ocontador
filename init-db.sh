#!/bin/bash
set -e
# Create alternative database name so connections using "contador_online" (with underscore) also work
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  SELECT 'CREATE DATABASE contador_online OWNER contador'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'contador_online')\gexec
EOSQL
