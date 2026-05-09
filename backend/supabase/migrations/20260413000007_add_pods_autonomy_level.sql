-- F006: Add autonomy_level column to pods table
-- 1=Observe only, 2=Plan & Propose, 3=Act with Confirmation, 4=Act Autonomously
ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS autonomy_level INT NOT NULL DEFAULT 1
    CHECK (autonomy_level BETWEEN 1 AND 4);
