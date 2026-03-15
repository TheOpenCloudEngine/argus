-- Argus Insight Server - PostgreSQL Database and User Setup
-- Run this script as a PostgreSQL superuser (e.g., postgres)
--
-- Usage:
--   sudo -u postgres psql -f argus-db-schema-postgresql.sql

-- Create user
CREATE USER argus WITH PASSWORD 'argus';

-- Create database
CREATE DATABASE argus
    OWNER = argus
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE argus TO argus;

-- Connect to the argus database and set up schema permissions
\c argus

GRANT ALL PRIVILEGES ON SCHEMA public TO argus;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO argus;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO argus;

CREATE TABLE IF NOT EXISTS argus_agents (
    hostname        VARCHAR(255)    PRIMARY KEY,
    ip_address      VARCHAR(45)     NOT NULL,
    version         VARCHAR(50),
    kernel_version  VARCHAR(255),
    os_version      VARCHAR(255),
    cpu_count       INTEGER,
    core_count      INTEGER,
    total_memory    BIGINT,
    cpu_usage       DOUBLE PRECISION,
    memory_usage    DOUBLE PRECISION,
    status          VARCHAR(20)     NOT NULL DEFAULT 'UNREGISTERED',
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE argus_agents IS 'Agent master table storing identity and latest resource usage';
COMMENT ON COLUMN argus_agents.hostname IS 'Agent hostname (unique identifier)';
COMMENT ON COLUMN argus_agents.ip_address IS 'Agent IP address (IPv4/IPv6)';
COMMENT ON COLUMN argus_agents.version IS 'Agent software version';
COMMENT ON COLUMN argus_agents.kernel_version IS 'OS kernel version';
COMMENT ON COLUMN argus_agents.os_version IS 'OS distribution and version';
COMMENT ON COLUMN argus_agents.cpu_count IS 'Logical CPU count';
COMMENT ON COLUMN argus_agents.core_count IS 'Physical core count';
COMMENT ON COLUMN argus_agents.total_memory IS 'Total memory in bytes';
COMMENT ON COLUMN argus_agents.cpu_usage IS 'Total CPU usage percentage (0.0-100.0)';
COMMENT ON COLUMN argus_agents.memory_usage IS 'Total memory usage percentage (0.0-100.0)';
COMMENT ON COLUMN argus_agents.status IS 'UNREGISTERED | REGISTERED | DISCONNECTED';

CREATE TABLE IF NOT EXISTS argus_agents_heartbeat (
    hostname            VARCHAR(255)    PRIMARY KEY,
    last_heartbeat_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE argus_agents_heartbeat IS 'Tracks the last heartbeat timestamp per agent';
COMMENT ON COLUMN argus_agents_heartbeat.hostname IS 'Agent hostname (references argus_agents)';
COMMENT ON COLUMN argus_agents_heartbeat.last_heartbeat_at IS 'Timestamp of the last heartbeat received';
