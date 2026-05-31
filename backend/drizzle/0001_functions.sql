-- 0001_functions.sql — app Postgres functions + triggers carried forward from Supabase.
-- pgvector internals come from CREATE EXTENSION vector; RLS helpers are dropped.
-- handle_new_user() is intentionally omitted (Epic 1 replaces it with handle_new_public_user).

CREATE OR REPLACE FUNCTION public.check_embeddings_status()
 RETURNS TABLE(table_name text, total_rows bigint, rows_with_embeddings bigint, percentage double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select 
    'projects'::text,
    count(*)::bigint,
    count(description_embedding)::bigint,
    (count(description_embedding)::float / nullif(count(*), 0)::float * 100) as percentage
  from projects
  union all
  select 
    'ai_messages'::text,
    count(*)::bigint,
    count(content_embedding)::bigint,
    (count(content_embedding)::float / nullif(count(*), 0)::float * 100) as percentage
  from ai_messages
  union all
  select 
    'users'::text,
    count(*)::bigint,
    count(profile_embedding)::bigint,
    (count(profile_embedding)::float / nullif(count(*), 0)::float * 100) as percentage
  from users;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_single_master_doc()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.is_master = TRUE THEN
    -- Unset all other master docs in the same category/account
    IF NEW.category_id IS NOT NULL THEN
      UPDATE public.knowledge_docs
      SET is_master = FALSE
      WHERE account_id = NEW.account_id
        AND category_id = NEW.category_id
        AND id != NEW.id
        AND is_master = TRUE;
    ELSE
      -- Uncategorized: unset other uncategorized master docs
      UPDATE public.knowledge_docs
      SET is_master = FALSE
      WHERE account_id = NEW.account_id
        AND category_id IS NULL
        AND id != NEW.id
        AND is_master = TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.exec_sql(query_text text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  result json;
begin
  -- Basic safety check: reject common write keywords if possible, 
  -- though the backend overrides this logic too.
  -- This is a backup.
  if lower(query_text) ~ '\s*(insert|update|delete|drop|alter|truncate|create|grant|revoke)\s+' then
    raise exception 'Only SELECT queries are allowed.';
  end if;

  execute 'select json_agg(t) from (' || query_text || ') t' into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_category_default_skills(p_category_id uuid)
 RETURNS TABLE(skill_id uuid, name text, instructions text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.instructions
  FROM public.skills s
  INNER JOIN public.category_skills cs ON cs.skill_id = s.id
  WHERE cs.category_id = p_category_id
    AND s.is_active = TRUE
  ORDER BY s.name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_newly_unblocked_tasks(p_completed_task_id uuid)
 RETURNS TABLE(task_id uuid)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.increment_agent_stats(p_agent_id uuid, p_completed_delta integer, p_failed_delta integer, p_tokens_delta bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE agents
  SET
    total_tasks_completed = total_tasks_completed + p_completed_delta,
    total_tasks_failed    = total_tasks_failed + p_failed_delta,
    total_tokens_used     = total_tokens_used + p_tokens_delta,
    last_active_at        = CASE WHEN p_completed_delta > 0 OR p_failed_delta > 0
                              THEN now() ELSE last_active_at END
  WHERE id = p_agent_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_memories_vector(query_embedding vector, p_account_id uuid, match_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.3, p_task_id uuid DEFAULT NULL::uuid, p_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, account_id uuid, content text, type text, source text, salience double precision, task_id uuid, conversation_id uuid, metadata jsonb, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.account_id,
    m.content,
    m.type,
    m.source,
    m.salience,
    m.task_id,
    m.conversation_id,
    m.metadata,
    m.created_at,
    1 - (m.content_embedding <=> query_embedding) AS similarity
  FROM agent_memories m
  WHERE m.account_id = p_account_id
    AND m.content_embedding IS NOT NULL
    AND m.valid_to IS NULL
    AND (p_task_id IS NULL OR m.task_id = p_task_id)
    AND (p_type IS NULL OR m.type = p_type)
    AND 1 - (m.content_embedding <=> query_embedding) > similarity_threshold
  ORDER BY m.content_embedding <=> query_embedding
  LIMIT match_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_messages_vector(query_embedding vector, conversation_id_filter uuid DEFAULT NULL::uuid, match_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, conversation_id uuid, role text, content text, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select 
    m.id,
    m.conversation_id,
    m.role,
    m.content,
    m.created_at,
    1 - (m.content_embedding <=> query_embedding) as similarity
  from ai_messages m
  where m.content_embedding is not null
    and (conversation_id_filter is null or m.conversation_id = conversation_id_filter)
    and 1 - (m.content_embedding <=> query_embedding) > similarity_threshold
  order by m.content_embedding <=> query_embedding
  limit match_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_projects_vector(query_embedding vector, match_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, name text, description text, account_id uuid, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select 
    p.id,
    p.name,
    p.description,
    p.account_id,
    p.created_at,
    1 - (p.description_embedding <=> query_embedding) as similarity
  from projects p
  where p.description_embedding is not null
    and 1 - (p.description_embedding <=> query_embedding) > similarity_threshold
  order by p.description_embedding <=> query_embedding
  limit match_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_users_vector(query_embedding vector, match_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, email text, name text, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select 
    u.id,
    u.email,
    u.name,
    u.created_at,
    1 - (u.profile_embedding <=> query_embedding) as similarity
  from users u
  where u.profile_embedding is not null
    and 1 - (u.profile_embedding <=> query_embedding) > similarity_threshold
  order by u.profile_embedding <=> query_embedding
  limit match_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_syncs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Triggers
CREATE TRIGGER update_ai_provider_configs_updated_at BEFORE UPDATE ON public.ai_provider_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_board_instances_updated_at BEFORE UPDATE ON public.board_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_board_steps_updated_at BEFORE UPDATE ON public.board_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_board_templates_updated_at BEFORE UPDATE ON public.board_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_connections_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_definitions_updated_at BEFORE UPDATE ON public.integration_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_ensure_single_master_doc BEFORE INSERT OR UPDATE OF is_master ON public.knowledge_docs FOR EACH ROW WHEN ((new.is_master = true)) EXECUTE FUNCTION ensure_single_master_doc();
CREATE TRIGGER update_knowledge_docs_updated_at BEFORE UPDATE ON public.knowledge_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_on_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();
CREATE TRIGGER update_provider_agents_updated_at BEFORE UPDATE ON public.provider_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_syncs_set_updated_at BEFORE UPDATE ON public.syncs FOR EACH ROW EXECUTE FUNCTION set_syncs_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
