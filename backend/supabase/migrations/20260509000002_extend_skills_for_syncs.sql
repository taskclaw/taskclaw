-- ============================================================
-- F1 — Skills extended with source provenance (PRD §4.3)
-- A skill can come from one of four sources:
--   custom      : authored in TaskClaw (the only source today)
--   disk-scan   : discovered by a Skills Sync scanning local folders
--   git-repo    : imported from a repo by a Skills Sync
--   marketplace : pulled from the public skill marketplace
-- ============================================================

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'custom'
    CHECK (source_type IN ('custom', 'disk-scan', 'git-repo', 'marketplace')),

  -- Stable identity within the source. Examples:
  --   file://~/.claude/skills/youtube-producer
  --   github://owner/repo#path/to/skill@<commit-sha>
  --   market://<marketplace-uuid>
  ADD COLUMN IF NOT EXISTS source_uri text,

  -- Which sync produced/manages this row. NULL for source_type='custom'.
  -- ON DELETE SET NULL keeps the skill row even if the user removes the sync —
  -- they can still use the imported snapshot, it just stops auto-updating.
  ADD COLUMN IF NOT EXISTS source_sync_id uuid REFERENCES syncs(id) ON DELETE SET NULL,

  -- Frontmatter version, commit sha, or marketplace release tag.
  ADD COLUMN IF NOT EXISTS source_version text,

  -- True for disk-scan rows that exist on a local filesystem the user can edit.
  -- The slash-command palette uses this to surface "On your machine" skills
  -- that haven't been imported yet.
  ADD COLUMN IF NOT EXISTS locally_available boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_skills_source_type
  ON skills(account_id, source_type);

CREATE INDEX IF NOT EXISTS idx_skills_source_sync
  ON skills(source_sync_id)
  WHERE source_sync_id IS NOT NULL;

-- One skill per (account, source_type, source_uri) when imported from an
-- external source. Custom skills (source_type='custom', source_uri NULL) are
-- excluded from this uniqueness — they collide on NULL and the user is
-- expected to manage their own naming there.
CREATE UNIQUE INDEX IF NOT EXISTS skills_source_uri_unique
  ON skills(account_id, source_type, source_uri)
  WHERE source_uri IS NOT NULL;
