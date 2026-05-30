-- M02: Migrate existing categories to agents (F01 - category→agent backfill)
-- Each category becomes an agent with type='worker' and migrated_from_category_id set.
-- This is the dual-write period: categories still exist, agents shadow them.

-- fix: this is a legacy DATA backfill from the old `categories` table. On a fresh
-- install that table (and columns like c.description) never exists, so the
-- statement failed to parse/plan. Guard the whole backfill on the source columns
-- existing, and run it via EXECUTE so the planner never touches `categories`
-- when it's absent. Installs that already ran this migration are unaffected
-- (the backfill simply re-runs as a NOT EXISTS / ON CONFLICT no-op).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'description'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'preferred_backbone_connection_id'
  ) THEN
    EXECUTE $mig$
      INSERT INTO agents (
        account_id,
        name,
        slug,
        color,
        persona,
        backbone_connection_id,
        agent_type,
        status,
        is_active,
        migrated_from_category_id,
        created_at,
        updated_at
      )
      SELECT
        c.account_id,
        c.name,
        -- Generate slug: lowercase, replace spaces/special chars with hyphens
        lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')),
        COALESCE(c.color, '#6366f1'),
        c.description,
        c.preferred_backbone_connection_id,
        'worker',
        'idle',
        true,
        c.id,
        c.created_at,
        c.updated_at
      FROM categories c
      -- Avoid duplicates if migration is re-run
      WHERE NOT EXISTS (
        SELECT 1 FROM agents a
        WHERE a.migrated_from_category_id = c.id
      )
      ON CONFLICT (account_id, slug)
      DO UPDATE SET
        migrated_from_category_id = EXCLUDED.migrated_from_category_id,
        updated_at = now();
    $mig$;
  END IF;
END $$;
