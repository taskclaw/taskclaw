-- 0003_realtime_triggers.sql — Epic 4: replace Supabase Realtime with pg LISTEN/NOTIFY.
--
-- A lightweight NOTIFY (table, event, id, account_id) fires on every change to the
-- tables the cockpit watches. The NestJS SSE gateway LISTENs on 'taskclaw_events'
-- and pushes per-account events; the frontend refetches on receipt. Payload is kept
-- tiny (well under the 8000-byte NOTIFY limit) — no row data is shipped.

CREATE OR REPLACE FUNCTION public.taskclaw_notify_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rec record;
BEGIN
  rec := COALESCE(NEW, OLD);
  PERFORM pg_notify(
    'taskclaw_events',
    json_build_object(
      'table', TG_TABLE_NAME,
      'event', TG_OP,
      'id', rec.id,
      'account_id', rec.account_id
    )::text
  );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tasks ON public.tasks;
CREATE TRIGGER trg_notify_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.taskclaw_notify_event();

DROP TRIGGER IF EXISTS trg_notify_orchestrated_tasks ON public.orchestrated_tasks;
CREATE TRIGGER trg_notify_orchestrated_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.orchestrated_tasks
  FOR EACH ROW EXECUTE FUNCTION public.taskclaw_notify_event();

-- On an adopted prod DB, retire the Supabase realtime publication (no-op on fresh DBs).
DROP PUBLICATION IF EXISTS supabase_realtime;
