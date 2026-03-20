-- ═══════════════════════════════════════════════════════════
-- Integration Unification: Schema Changes
-- ═══════════════════════════════════════════════════════════

-- Add connection_id FK to sources table (links source sync config to integration credentials)
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sources_connection_id ON public.sources(connection_id) WHERE connection_id IS NOT NULL;

-- Add health monitoring columns to integration_connections (for comm tools)
ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_healthy_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_interval_minutes INTEGER DEFAULT 5;

-- Add constraints (safe with IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_health_status_check'
  ) THEN
    ALTER TABLE public.integration_connections
      ADD CONSTRAINT integration_connections_health_status_check
      CHECK (health_status IN ('healthy', 'unhealthy', 'checking', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_check_interval_check'
  ) THEN
    ALTER TABLE public.integration_connections
      ADD CONSTRAINT integration_connections_check_interval_check
      CHECK (check_interval_minutes >= 1 AND check_interval_minutes <= 1440);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ic_health_check ON public.integration_connections(last_checked_at) WHERE health_status != 'unknown';
