-- F005: Create get_newly_unblocked_tasks SQL function
-- Returns orchestrated_task IDs whose ALL upstream deps are now completed,
-- given a task that just completed. Replaces N+1 loop in application code.
CREATE OR REPLACE FUNCTION get_newly_unblocked_tasks(p_completed_task_id UUID)
RETURNS TABLE(task_id UUID) AS $$
  WITH direct_downstream AS (
    -- All tasks that have p_completed_task_id as an upstream dependency
    SELECT DISTINCT d.downstream_task_id
    FROM orchestrated_task_deps d
    WHERE d.upstream_task_id = p_completed_task_id
  ),
  upstream_status AS (
    -- For each downstream task, count total upstream deps vs completed upstream deps
    SELECT
      dd.downstream_task_id,
      COUNT(d.upstream_task_id)                                             AS total_deps,
      COUNT(CASE WHEN ot.status = 'completed' THEN 1 END)                   AS completed_deps
    FROM direct_downstream dd
    JOIN orchestrated_task_deps d ON d.downstream_task_id = dd.downstream_task_id
    JOIN orchestrated_tasks ot    ON ot.id = d.upstream_task_id
    GROUP BY dd.downstream_task_id
  )
  SELECT downstream_task_id AS task_id
  FROM upstream_status
  WHERE total_deps = completed_deps;
$$ LANGUAGE sql STABLE;
