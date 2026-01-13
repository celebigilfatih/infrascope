-- ============================================================================
-- InfraScope - PostgreSQL Initialization Script
-- Creates extensions and initial configuration
-- ============================================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "plpgsql";

-- Set default timezone
ALTER DATABASE infrascope SET timezone = 'UTC';

-- Create schema for infrastructure
CREATE SCHEMA IF NOT EXISTS infrastructure;

-- Grant permissions
GRANT CREATE ON DATABASE infrascope TO infrascope;
GRANT ALL PRIVILEGES ON SCHEMA infrastructure TO infrascope;

-- Logging table for audit trail (optional)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    user_name TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changes JSONB
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);

-- ============================================================================
-- Notes:
-- This file runs automatically when the PostgreSQL container starts
-- It's mounted at /docker-entrypoint-initdb.d/init.sql
-- ============================================================================
