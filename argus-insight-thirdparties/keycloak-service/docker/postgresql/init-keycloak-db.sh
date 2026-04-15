#!/bin/bash
set -e

# Keycloak database initialization script
# This script runs only on first container start (when data directory is empty)

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable extensions useful for Keycloak
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Verify database is ready
    SELECT version();
EOSQL

echo "Keycloak database initialized successfully."
