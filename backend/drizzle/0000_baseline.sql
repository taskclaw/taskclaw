CREATE TABLE "account_users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"user_id" uuid,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "account_users_account_id_user_id_key" UNIQUE("account_id","user_id"),
	CONSTRAINT "account_users_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"onboarding_completed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "agent_activity" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"activity_type" varchar(30) NOT NULL,
	"task_id" uuid,
	"dag_id" uuid,
	"conversation_id" uuid,
	"board_id" uuid,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orchestrated_task_id" uuid NOT NULL,
	"requested_by_agent_id" uuid,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"responded_at" timestamp with time zone,
	"response_note" text,
	CONSTRAINT "agent_approval_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"content" text NOT NULL,
	"content_embedding" vector(1536),
	"type" text DEFAULT 'episodic' NOT NULL,
	"source" text DEFAULT 'agent' NOT NULL,
	"salience" double precision DEFAULT 1 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now(),
	"valid_to" timestamp with time zone,
	"task_id" uuid,
	"board_instance_id" uuid,
	"category_id" uuid,
	"conversation_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_memories_source_check" CHECK (source = ANY (ARRAY['agent'::text, 'human'::text, 'sync'::text])),
	CONSTRAINT "agent_memories_type_check" CHECK (type = ANY (ARRAY['episodic'::text, 'semantic'::text, 'procedural'::text, 'working'::text]))
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"agent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "agent_skills_pkey" PRIMARY KEY("agent_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agent_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"provider_agent_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"instructions_hash" text,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_sync_logs_action_check" CHECK (action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'verify'::text])),
	CONSTRAINT "agent_sync_logs_status_check" CHECK (status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"avatar_url" text,
	"description" text,
	"persona" text,
	"color" varchar(7),
	"backbone_connection_id" uuid,
	"model_override" varchar(100),
	"max_concurrent_tasks" integer DEFAULT 3,
	"status" varchar(20) DEFAULT 'idle' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"agent_type" varchar(20) DEFAULT 'worker' NOT NULL,
	"total_tasks_completed" integer DEFAULT 0,
	"total_tasks_failed" integer DEFAULT 0,
	"total_tokens_used" bigint DEFAULT 0,
	"last_active_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"migrated_from_category_id" uuid,
	"custom_env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "agents_unique_slug_per_account" UNIQUE("account_id","slug"),
	CONSTRAINT "agents_custom_args_array" CHECK (jsonb_typeof(custom_args) = 'array'::text),
	CONSTRAINT "agents_custom_env_object" CHECK (jsonb_typeof(custom_env) = 'object'::text),
	CONSTRAINT "agents_status_check" CHECK ((status)::text = ANY ((ARRAY['idle'::character varying, 'working'::character varying, 'paused'::character varying, 'error'::character varying, 'offline'::character varying])::text[])),
	CONSTRAINT "agents_type_check" CHECK ((agent_type)::text = ANY ((ARRAY['worker'::character varying, 'pilot'::character varying, 'coordinator'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"is_public" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_call_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"content_embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_type" text DEFAULT 'openclaw' NOT NULL,
	"api_url" text NOT NULL,
	"api_key" text NOT NULL,
	"agent_id" text,
	"is_active" boolean DEFAULT true,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"openrouter_api_key" text,
	"telegram_bot_token" text,
	"brave_search_api_key" text,
	"migrated_to" uuid,
	CONSTRAINT "ai_provider_configs_account_id_provider_type_key" UNIQUE("account_id","provider_type")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"name" varchar(100) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "autopilot_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"autopilot_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"cron_expression" text,
	"webhook_token" text,
	"next_run_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autopilot_triggers_kind_check" CHECK (kind = ANY (ARRAY['schedule'::text, 'webhook'::text, 'manual'::text, 'mention'::text]))
);
--> statement-breakpoint
CREATE TABLE "backbone_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"backbone_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"health_status" text DEFAULT 'unknown',
	"health_checked_at" timestamp with time zone,
	"health_error" text,
	"verified_at" timestamp with time zone,
	"total_requests" bigint DEFAULT 0,
	"total_tokens" bigint DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "backbone_connections_health_status_check" CHECK (health_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'unknown'::text]))
);
--> statement-breakpoint
CREATE TABLE "backbone_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'bot' NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"protocol" text NOT NULL,
	"supports_streaming" boolean DEFAULT true,
	"supports_heartbeat" boolean DEFAULT false,
	"supports_agent_mode" boolean DEFAULT false,
	"supports_tool_use" boolean DEFAULT false,
	"supports_file_access" boolean DEFAULT false,
	"supports_code_execution" boolean DEFAULT false,
	"config_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "backbone_definitions_slug_key" UNIQUE("slug"),
	CONSTRAINT "backbone_definitions_protocol_check" CHECK (protocol = ANY (ARRAY['websocket'::text, 'http'::text, 'mcp'::text, 'cli'::text]))
);
--> statement-breakpoint
CREATE TABLE "board_instances" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'layout-grid',
	"color" text DEFAULT '#6366f1',
	"tags" text[] DEFAULT '{}',
	"is_favorite" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"settings_override" jsonb DEFAULT '{}'::jsonb,
	"installed_manifest" jsonb,
	"installed_version" text,
	"latest_available_version" text,
	"is_archived" boolean DEFAULT false,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"default_category_id" uuid,
	"orchestrator_category_id" uuid,
	"default_backbone_connection_id" uuid,
	"pod_id" uuid,
	"backbone_connection_id" uuid
);
--> statement-breakpoint
CREATE TABLE "board_integration_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "board_integration_refs_unique" UNIQUE("board_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "board_routes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"source_board_id" uuid NOT NULL,
	"source_step_id" uuid,
	"target_board_id" uuid NOT NULL,
	"target_step_id" uuid,
	"trigger" text DEFAULT 'auto' NOT NULL,
	"transform_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"trigger_on_step_complete" boolean DEFAULT true,
	"label" text,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"pod_id" uuid,
	CONSTRAINT "board_routes_trigger_check" CHECK (trigger = ANY (ARRAY['auto'::text, 'manual'::text, 'ai_decision'::text, 'error'::text, 'fallback'::text]))
);
--> statement-breakpoint
CREATE TABLE "board_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"board_instance_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"name" text NOT NULL,
	"step_type" text NOT NULL,
	"position" integer NOT NULL,
	"color" text,
	"ai_enabled" boolean DEFAULT false,
	"ai_first" boolean DEFAULT false,
	"system_prompt" text,
	"model_override" text,
	"temperature" double precision,
	"max_retries" integer DEFAULT 2,
	"timeout_seconds" integer DEFAULT 120,
	"skill_ids" uuid[] DEFAULT '{}',
	"knowledge_base_ids" uuid[] DEFAULT '{}',
	"required_tool_ids" text[] DEFAULT '{}',
	"input_fields" jsonb DEFAULT '[]'::jsonb,
	"output_fields" jsonb DEFAULT '[]'::jsonb,
	"trigger_type" text DEFAULT 'manual',
	"trigger_config" jsonb DEFAULT '{}'::jsonb,
	"on_complete_step_key" text,
	"on_error_step_key" text,
	"routing_rules" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"linked_category_id" uuid,
	"input_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"on_success_step_id" uuid,
	"on_error_step_id" uuid,
	"webhook_url" text,
	"webhook_auth_header" text,
	"schedule_cron" text,
	"backbone_connection_id" uuid,
	"default_agent_id" uuid,
	CONSTRAINT "board_steps_board_instance_id_step_key_key" UNIQUE("board_instance_id","step_key"),
	CONSTRAINT "board_steps_step_type_check" CHECK (step_type = ANY (ARRAY['input'::text, 'ai_process'::text, 'human_review'::text, 'action'::text, 'done'::text])),
	CONSTRAINT "board_steps_trigger_type_check" CHECK (trigger_type = ANY (ARRAY['on_entry'::text, 'auto'::text, 'manual'::text, 'schedule'::text, 'webhook'::text]))
);
--> statement-breakpoint
CREATE TABLE "board_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'layout-grid',
	"color" text DEFAULT '#6366f1',
	"tags" text[] DEFAULT '{}',
	"manifest" jsonb NOT NULL,
	"manifest_version" text DEFAULT '1.0' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"changelog" text,
	"is_published" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"author_name" text,
	"author_email" text,
	"install_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "board_templates_account_id_slug_key" UNIQUE("account_id","slug")
);
--> statement-breakpoint
CREATE TABLE "card_executions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"card_id" uuid NOT NULL,
	"board_step_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"system_prompt_used" text,
	"ai_request" jsonb,
	"ai_response" jsonb,
	"tokens_used" jsonb,
	"output_data" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"routed_to_step_key" text,
	"routing_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "card_executions_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"visible" boolean DEFAULT true NOT NULL,
	"preferred_backbone_connection_id" uuid,
	CONSTRAINT "categories_account_id_name_key" UNIQUE("account_id","name")
);
--> statement-breakpoint
CREATE TABLE "category_skills" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"category_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "category_skills_unique" UNIQUE("category_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "circuit_breaker_states" (
	"config_id" uuid PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"state" text DEFAULT 'closed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"task_id" uuid,
	"title" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"board_id" uuid,
	"backbone_connection_id" uuid,
	"pod_id" uuid,
	"is_workspace" boolean DEFAULT false,
	"agent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "dag_approvals" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"dag_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "dag_approvals_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);
--> statement-breakpoint
CREATE TABLE "execution_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text NOT NULL,
	"pod_id" uuid,
	"board_id" uuid,
	"task_id" uuid,
	"dag_id" uuid,
	"heartbeat_config_id" uuid,
	"route_id" uuid,
	"conversation_id" uuid,
	"summary" text,
	"error_details" text,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "execution_log_status_check" CHECK (status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text, 'running'::text, 'timeout'::text, 'dry_run'::text])),
	CONSTRAINT "execution_log_trigger_type_check" CHECK (trigger_type = ANY (ARRAY['heartbeat'::text, 'dag_step'::text, 'route_transfer'::text, 'tool_execution'::text, 'coordinator'::text, 'manual'::text, 'workspace_chat'::text]))
);
--> statement-breakpoint
CREATE TABLE "heartbeat_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"pod_id" uuid,
	"board_id" uuid,
	"name" text NOT NULL,
	"schedule" text DEFAULT '0 */4 * * *' NOT NULL,
	"prompt" text DEFAULT 'Review pending tasks and take appropriate actions.' NOT NULL,
	"is_active" boolean DEFAULT false,
	"dry_run" boolean DEFAULT false,
	"max_tasks_per_run" integer DEFAULT 5,
	"circuit_breaker_threshold" integer DEFAULT 3,
	"consecutive_failures" integer DEFAULT 0,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"last_run_summary" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"pilot_enabled" boolean DEFAULT false,
	"execution_mode" text DEFAULT 'create_task' NOT NULL,
	"concurrency_policy" text DEFAULT 'queue' NOT NULL,
	CONSTRAINT "heartbeat_configs_concurrency_policy_check" CHECK (concurrency_policy = ANY (ARRAY['skip'::text, 'queue'::text, 'replace'::text])),
	CONSTRAINT "heartbeat_configs_execution_mode_check" CHECK (execution_mode = ANY (ARRAY['create_task'::text, 'run_only'::text])),
	CONSTRAINT "heartbeat_configs_last_run_status_check" CHECK (last_run_status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text, 'running'::text]))
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"credentials" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[],
	"status" varchar(20) DEFAULT 'pending',
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"error_message" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"external_account_name" varchar(255),
	"test_conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"health_status" varchar(20) DEFAULT 'unknown',
	"last_checked_at" timestamp with time zone,
	"last_healthy_at" timestamp with time zone,
	"check_interval_minutes" integer DEFAULT 5,
	CONSTRAINT "integration_connections_unique_per_account" UNIQUE("account_id","definition_id"),
	CONSTRAINT "integration_connections_check_interval_check" CHECK ((check_interval_minutes >= 1) AND (check_interval_minutes <= 1440)),
	CONSTRAINT "integration_connections_health_status_check" CHECK ((health_status)::text = ANY ((ARRAY['healthy'::character varying, 'unhealthy'::character varying, 'checking'::character varying, 'unknown'::character varying])::text[])),
	CONSTRAINT "integration_connections_status_check" CHECK ((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'expired'::character varying, 'error'::character varying, 'revoked'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "integration_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"categories" text[] DEFAULT '{}',
	"auth_type" varchar(20) NOT NULL,
	"auth_config" jsonb DEFAULT '{}'::jsonb,
	"config_fields" jsonb DEFAULT '[]'::jsonb,
	"skill_id" uuid,
	"setup_guide" text,
	"is_system" boolean DEFAULT false,
	"proxy_base_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "integration_definitions_unique_slug" UNIQUE("account_id","slug"),
	CONSTRAINT "integration_definitions_auth_type_check" CHECK ((auth_type)::text = ANY ((ARRAY['api_key'::character varying, 'oauth2'::character varying, 'webhook'::character varying, 'basic'::character varying, 'none'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "integration_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid,
	"account_id" uuid,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"http_method" varchar(10) DEFAULT 'POST' NOT NULL,
	"endpoint_template" varchar(500) NOT NULL,
	"auth_header_name" varchar(100),
	"auth_credential_key" varchar(100),
	"request_body_schema" jsonb,
	"response_schema" jsonb,
	"response_extract" varchar(200),
	"is_streaming" boolean DEFAULT false,
	"timeout_seconds" integer DEFAULT 300,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "invitations_account_id_email_key" UNIQUE("account_id","email"),
	CONSTRAINT "invitations_token_key" UNIQUE("token"),
	CONSTRAINT "invitations_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
);
--> statement-breakpoint
CREATE TABLE "knowledge_docs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"is_master" boolean DEFAULT false,
	"file_attachments" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"agent_id" uuid,
	CONSTRAINT "knowledge_docs_content_size" CHECK (char_length(content) <= 102400),
	CONSTRAINT "knowledge_docs_title_not_empty" CHECK (char_length(TRIM(BOTH FROM title)) > 0)
);
--> statement-breakpoint
CREATE TABLE "memory_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"adapter_slug" text DEFAULT 'default' NOT NULL,
	"name" text DEFAULT 'Default Memory' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_account_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"backbone_connection_id" uuid,
	"kind" text DEFAULT 'text' NOT NULL,
	"author_type" text,
	"author_id" uuid,
	"search_index" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(content, ''::text))) STORED,
	CONSTRAINT "messages_author_type_check" CHECK (author_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text])),
	CONSTRAINT "messages_kind_check" CHECK (kind = ANY (ARRAY['text'::text, 'thinking'::text, 'tool_use'::text, 'tool_result'::text, 'status'::text, 'error'::text, 'log'::text])),
	CONSTRAINT "messages_role_check" CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text]))
);
--> statement-breakpoint
CREATE TABLE "orchestrated_task_deps" (
	"upstream_task_id" uuid NOT NULL,
	"downstream_task_id" uuid NOT NULL,
	CONSTRAINT "orchestrated_task_deps_pkey" PRIMARY KEY("upstream_task_id","downstream_task_id"),
	CONSTRAINT "orchestrated_task_deps_check" CHECK (upstream_task_id <> downstream_task_id)
);
--> statement-breakpoint
CREATE TABLE "orchestrated_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"pod_id" uuid,
	"parent_orchestrated_task_id" uuid,
	"goal" text NOT NULL,
	"input_context" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"autonomy_level" integer DEFAULT 1 NOT NULL,
	"result_summary" text,
	"structured_output" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "orchestrated_tasks_autonomy_level_check" CHECK ((autonomy_level >= 1) AND (autonomy_level <= 4)),
	CONSTRAINT "orchestrated_tasks_status_check" CHECK (status = ANY (ARRAY['pending_approval'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pilot_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"pod_id" uuid,
	"backbone_connection_id" uuid,
	"system_prompt" text DEFAULT 'You are a project coordinator. Review the current state of tasks and boards, then suggest and execute actions to move work forward.' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"max_tasks_per_cycle" integer DEFAULT 10 NOT NULL,
	"approval_required" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_summary" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd',
	"interval" text NOT NULL,
	"features" jsonb,
	"is_default" boolean DEFAULT false,
	"is_hidden" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"stripe_price_id" text,
	"stripe_product_id" text,
	CONSTRAINT "plans_interval_check" CHECK ("interval" = ANY (ARRAY['month'::text, 'year'::text]))
);
--> statement-breakpoint
CREATE TABLE "pods" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'layers',
	"color" text DEFAULT '#6366f1',
	"backbone_connection_id" uuid,
	"agent_config" jsonb DEFAULT '{}'::jsonb,
	"position" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"pilot_agent_id" uuid,
	"autonomy_level" integer DEFAULT 1 NOT NULL,
	"search_index" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE(description, ''::text)))) STORED,
	CONSTRAINT "pods_account_id_slug_key" UNIQUE("account_id","slug"),
	CONSTRAINT "pods_autonomy_level_check" CHECK ((autonomy_level >= 1) AND (autonomy_level <= 4))
);
--> statement-breakpoint
CREATE TABLE "project_users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "project_users_project_id_user_id_key" UNIQUE("project_id","user_id"),
	CONSTRAINT "project_users_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'viewer'::text]))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"description_embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "provider_agents" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"provider_type" text DEFAULT 'openclaw' NOT NULL,
	"remote_skill_path" text,
	"instructions_hash" text,
	"compiled_instructions" text,
	"skill_ids_snapshot" jsonb DEFAULT '[]'::jsonb,
	"knowledge_doc_id" uuid,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"agent_id" uuid,
	CONSTRAINT "provider_agents_unique_account_category" UNIQUE("account_id","category_id"),
	CONSTRAINT "provider_agents_sync_status_check" CHECK (sync_status = ANY (ARRAY['pending'::text, 'syncing'::text, 'synced'::text, 'error'::text, 'stale'::text]))
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "semaphore_leases" (
	"account_id" uuid NOT NULL,
	"resource_key" text NOT NULL,
	"holder_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "semaphore_leases_pkey" PRIMARY KEY("account_id","resource_key","holder_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"instructions" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"file_attachments" jsonb DEFAULT '[]'::jsonb,
	"skill_type" varchar(30) DEFAULT 'general',
	"source_type" text DEFAULT 'custom' NOT NULL,
	"source_uri" text,
	"source_sync_id" uuid,
	"source_version" text,
	"locally_available" boolean DEFAULT false NOT NULL,
	"search_index" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE(description, ''::text)))) STORED,
	CONSTRAINT "skills_unique_name_per_account" UNIQUE("account_id","name"),
	CONSTRAINT "skills_instructions_size" CHECK (char_length(instructions) <= 51200),
	CONSTRAINT "skills_name_not_empty" CHECK (char_length(TRIM(BOTH FROM name)) > 0),
	CONSTRAINT "skills_skill_type_check" CHECK ((skill_type)::text = ANY ((ARRAY['general'::character varying, 'integration'::character varying, 'board'::character varying, 'system'::character varying])::text[])),
	CONSTRAINT "skills_source_type_check" CHECK (source_type = ANY (ARRAY['custom'::text, 'disk-scan'::text, 'git-repo'::text, 'marketplace'::text]))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"sync_interval_minutes" integer DEFAULT 30,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"sync_filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_property" text,
	"connection_id" uuid,
	CONSTRAINT "sources_provider_check" CHECK (provider = ANY (ARRAY['notion'::text, 'clickup'::text, 'trello'::text, 'local'::text])),
	CONSTRAINT "sources_sync_status_check" CHECK (sync_status = ANY (ARRAY['idle'::text, 'syncing'::text, 'error'::text, 'disabled'::text]))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid,
	"plan_id" uuid,
	"status" text,
	"provider" text DEFAULT 'stripe',
	"provider_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_start" timestamp with time zone,
	CONSTRAINT "subscriptions_account_id_key" UNIQUE("account_id"),
	CONSTRAINT "subscriptions_status_check" CHECK (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text]))
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"source_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"tasks_synced" integer DEFAULT 0,
	"tasks_created" integer DEFAULT 0,
	"tasks_updated" integer DEFAULT 0,
	"tasks_deleted" integer DEFAULT 0,
	"error_log" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	CONSTRAINT "sync_jobs_direction_check" CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])),
	CONSTRAINT "sync_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"items_added" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_removed" integer DEFAULT 0 NOT NULL,
	"log_excerpt" text,
	"trigger" text NOT NULL,
	CONSTRAINT "sync_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text, 'partial'::text, 'cancelled'::text])),
	CONSTRAINT "sync_runs_trigger_check" CHECK (trigger = ANY (ARRAY['schedule'::text, 'manual'::text, 'hook'::text]))
);
--> statement-breakpoint
CREATE TABLE "syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sync_type" text NOT NULL,
	"source_kind" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_cron" text,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syncs_last_status_check" CHECK (last_status = ANY (ARRAY['ok'::text, 'error'::text, 'partial'::text, 'running'::text])),
	CONSTRAINT "syncs_source_kind_check" CHECK (source_kind = ANY (ARRAY['local-folder'::text, 'git-repo'::text, 'marketplace'::text, 'notion'::text, 'gdrive'::text])),
	CONSTRAINT "syncs_sync_type_check" CHECK (sync_type = ANY (ARRAY['skills'::text, 'knowledge'::text, 'pods'::text]))
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"allow_multiple_projects" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"theme_set" text DEFAULT 'corporate',
	"extended_settings" jsonb DEFAULT '{}'::jsonb,
	"allow_multiple_teams" boolean DEFAULT true,
	CONSTRAINT "system_settings_id_check" CHECK (id),
	CONSTRAINT "valid_theme_set" CHECK (theme_set = ANY (ARRAY['corporate'::text, 'funky'::text, 'blue'::text, 'red'::text, 'ocean-blue'::text, 'ruby-red'::text, 'emerald-green'::text, 'amber-gold'::text]))
);
--> statement-breakpoint
CREATE TABLE "task_dags" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"pod_id" uuid,
	"goal" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text DEFAULT 'human' NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	CONSTRAINT "task_dags_status_check" CHECK (status = ANY (ARRAY['pending_approval'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"dependency_type" text DEFAULT 'dag' NOT NULL,
	"route_id" uuid,
	"dag_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "task_dependencies_dependency_type_check" CHECK (dependency_type = ANY (ARRAY['route'::text, 'dag'::text, 'manual'::text]))
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"task_id" uuid,
	"orchestrated_task_id" uuid,
	"pod_id" uuid,
	"agent_id" uuid,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 2 NOT NULL,
	"parent_run_id" uuid,
	"trigger" text NOT NULL,
	"failure_reason" text,
	"failure_message" text,
	"result" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_runs_attempt_check" CHECK (attempt >= 1),
	CONSTRAINT "task_runs_failure_reason_check" CHECK ((failure_reason IS NULL) OR (failure_reason = ANY (ARRAY['agent_error'::text, 'timeout'::text, 'runtime_offline'::text, 'manual'::text, 'circuit_open'::text, 'invalid_input'::text, 'tool_error'::text, 'other'::text]))),
	CONSTRAINT "task_runs_max_attempts_check" CHECK (max_attempts >= 1),
	CONSTRAINT "task_runs_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
	CONSTRAINT "task_runs_trigger_check" CHECK (trigger = ANY (ARRAY['manual'::text, 'autopilot'::text, 'mention'::text, 'heartbeat'::text, 'dag'::text, 'schedule'::text]))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"source_id" uuid,
	"external_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'To-Do' NOT NULL,
	"priority" text DEFAULT 'Medium',
	"completed" boolean DEFAULT false,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"external_url" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"board_instance_id" uuid,
	"current_step_id" uuid,
	"card_data" jsonb DEFAULT '{}'::jsonb,
	"step_history" jsonb DEFAULT '[]'::jsonb,
	"override_category_id" uuid,
	"result" jsonb,
	"dag_id" uuid,
	"backbone_connection_id" uuid,
	"assignee_type" varchar(10) DEFAULT 'none',
	"assignee_id" uuid,
	"creator_type" text DEFAULT 'user' NOT NULL,
	"creator_id" uuid,
	"input_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_index" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(notes, ''::text)))) STORED,
	CONSTRAINT "tasks_source_id_external_id_key" UNIQUE("source_id","external_id"),
	CONSTRAINT "tasks_assignee_type_check" CHECK ((assignee_type)::text = ANY ((ARRAY['none'::character varying, 'agent'::character varying, 'human'::character varying])::text[])),
	CONSTRAINT "tasks_creator_type_check" CHECK (creator_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text])),
	CONSTRAINT "tasks_priority_check" CHECK (priority = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text, 'Urgent'::text]))
);
--> statement-breakpoint
CREATE TABLE "token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"message_id" uuid,
	"task_id" uuid,
	"agent_id" uuid,
	"pod_id" uuid,
	"conversation_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"pod_id" uuid,
	"agent_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"total_input_tokens" bigint DEFAULT 0 NOT NULL,
	"total_output_tokens" bigint DEFAULT 0 NOT NULL,
	"total_cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"total_cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"rolled_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"status" text DEFAULT 'pending' NOT NULL,
	"profile_embedding" vector(1536),
	"password_hash" text,
	"email_confirmed_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text]))
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'landing_page',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "waitlist_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"response_code" integer,
	"response_body" text,
	"attempts" integer DEFAULT 0,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "webhook_deliveries_status_check" CHECK ((status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."board_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_dag_id_fkey" FOREIGN KEY ("dag_id") REFERENCES "public"."task_dags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approval_requests" ADD CONSTRAINT "agent_approval_requests_orchestrated_task_id_fkey" FOREIGN KEY ("orchestrated_task_id") REFERENCES "public"."orchestrated_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approval_requests" ADD CONSTRAINT "agent_approval_requests_requested_by_agent_id_fkey" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_board_instance_id_fkey" FOREIGN KEY ("board_instance_id") REFERENCES "public"."board_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sync_logs" ADD CONSTRAINT "agent_sync_logs_provider_agent_id_fkey" FOREIGN KEY ("provider_agent_id") REFERENCES "public"."provider_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_migrated_to_fkey" FOREIGN KEY ("migrated_to") REFERENCES "public"."backbone_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_triggers" ADD CONSTRAINT "autopilot_triggers_autopilot_id_fkey" FOREIGN KEY ("autopilot_id") REFERENCES "public"."heartbeat_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backbone_connections" ADD CONSTRAINT "backbone_connections_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_default_backbone_connection_id_fkey" FOREIGN KEY ("default_backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_orchestrator_category_id_fkey" FOREIGN KEY ("orchestrator_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_instances" ADD CONSTRAINT "board_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."board_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_integration_refs" ADD CONSTRAINT "board_integration_refs_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."board_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_integration_refs" ADD CONSTRAINT "board_integration_refs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_source_board_id_fkey" FOREIGN KEY ("source_board_id") REFERENCES "public"."board_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_source_step_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "public"."board_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_target_board_id_fkey" FOREIGN KEY ("target_board_id") REFERENCES "public"."board_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_routes" ADD CONSTRAINT "board_routes_target_step_id_fkey" FOREIGN KEY ("target_step_id") REFERENCES "public"."board_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_board_instance_id_fkey" FOREIGN KEY ("board_instance_id") REFERENCES "public"."board_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_default_agent_id_fkey" FOREIGN KEY ("default_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_linked_category_id_fkey" FOREIGN KEY ("linked_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_on_error_step_id_fkey" FOREIGN KEY ("on_error_step_id") REFERENCES "public"."board_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_steps" ADD CONSTRAINT "board_steps_on_success_step_id_fkey" FOREIGN KEY ("on_success_step_id") REFERENCES "public"."board_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_templates" ADD CONSTRAINT "board_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_executions" ADD CONSTRAINT "card_executions_board_step_id_fkey" FOREIGN KEY ("board_step_id") REFERENCES "public"."board_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_executions" ADD CONSTRAINT "card_executions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_preferred_backbone_connection_id_fkey" FOREIGN KEY ("preferred_backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_skills" ADD CONSTRAINT "category_skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_skills" ADD CONSTRAINT "category_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."board_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dag_approvals" ADD CONSTRAINT "dag_approvals_dag_id_fkey" FOREIGN KEY ("dag_id") REFERENCES "public"."task_dags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dag_approvals" ADD CONSTRAINT "dag_approvals_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."board_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_dag_id_fkey" FOREIGN KEY ("dag_id") REFERENCES "public"."task_dags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_heartbeat_config_id_fkey" FOREIGN KEY ("heartbeat_config_id") REFERENCES "public"."heartbeat_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."board_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_log" ADD CONSTRAINT "execution_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_configs" ADD CONSTRAINT "heartbeat_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_configs" ADD CONSTRAINT "heartbeat_configs_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."board_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_configs" ADD CONSTRAINT "heartbeat_configs_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."integration_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_test_conversation_id_fkey" FOREIGN KEY ("test_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_definitions" ADD CONSTRAINT "integration_definitions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_definitions" ADD CONSTRAINT "integration_definitions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tools" ADD CONSTRAINT "integration_tools_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tools" ADD CONSTRAINT "integration_tools_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."integration_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_connections" ADD CONSTRAINT "memory_connections_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrated_task_deps" ADD CONSTRAINT "orchestrated_task_deps_downstream_task_id_fkey" FOREIGN KEY ("downstream_task_id") REFERENCES "public"."orchestrated_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrated_task_deps" ADD CONSTRAINT "orchestrated_task_deps_upstream_task_id_fkey" FOREIGN KEY ("upstream_task_id") REFERENCES "public"."orchestrated_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrated_tasks" ADD CONSTRAINT "orchestrated_tasks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrated_tasks" ADD CONSTRAINT "orchestrated_tasks_parent_orchestrated_task_id_fkey" FOREIGN KEY ("parent_orchestrated_task_id") REFERENCES "public"."orchestrated_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrated_tasks" ADD CONSTRAINT "orchestrated_tasks_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_configs" ADD CONSTRAINT "pilot_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_configs" ADD CONSTRAINT "pilot_configs_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_configs" ADD CONSTRAINT "pilot_configs_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_pilot_agent_id_fkey" FOREIGN KEY ("pilot_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agents" ADD CONSTRAINT "provider_agents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agents" ADD CONSTRAINT "provider_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_agents" ADD CONSTRAINT "provider_agents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_sync_id_fkey" FOREIGN KEY ("source_sync_id") REFERENCES "public"."syncs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_sync_id_fkey" FOREIGN KEY ("sync_id") REFERENCES "public"."syncs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syncs" ADD CONSTRAINT "syncs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dags" ADD CONSTRAINT "task_dags_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dags" ADD CONSTRAINT "task_dags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dags" ADD CONSTRAINT "task_dags_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dag_id_fkey" FOREIGN KEY ("dag_id") REFERENCES "public"."task_dags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."board_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_target_task_id_fkey" FOREIGN KEY ("target_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_orchestrated_task_id_fkey" FOREIGN KEY ("orchestrated_task_id") REFERENCES "public"."orchestrated_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "public"."task_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_backbone_connection_id_fkey" FOREIGN KEY ("backbone_connection_id") REFERENCES "public"."backbone_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_instance_id_fkey" FOREIGN KEY ("board_instance_id") REFERENCES "public"."board_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "public"."board_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dag_id_fkey" FOREIGN KEY ("dag_id") REFERENCES "public"."task_dags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_override_category_id_fkey" FOREIGN KEY ("override_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage_daily" ADD CONSTRAINT "token_usage_daily_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage_daily" ADD CONSTRAINT "token_usage_daily_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage_daily" ADD CONSTRAINT "token_usage_daily_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_activity_account" ON "agent_activity" USING btree ("account_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_agent_activity_agent" ON "agent_activity" USING btree ("agent_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_agent_approval_requests_task_status" ON "agent_approval_requests" USING btree ("orchestrated_task_id","status");--> statement-breakpoint
CREATE INDEX "idx_agent_memories_account" ON "agent_memories" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_agent_memories_conversation" ON "agent_memories" USING btree ("conversation_id") WHERE (conversation_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agent_memories_embedding" ON "agent_memories" USING hnsw ("content_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_memories_salience" ON "agent_memories" USING btree ("account_id","salience" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_agent_memories_task" ON "agent_memories" USING btree ("task_id") WHERE (task_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agent_memories_type" ON "agent_memories" USING btree ("account_id","type");--> statement-breakpoint
CREATE INDEX "idx_agent_skills_agent_id" ON "agent_skills" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_skills_skill_id" ON "agent_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_agent_sync_logs_account" ON "agent_sync_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_agent_sync_logs_agent" ON "agent_sync_logs" USING btree ("provider_agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_sync_logs_created" ON "agent_sync_logs" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_agents_account_id" ON "agents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_agents_migrated_from_category" ON "agents" USING btree ("migrated_from_category_id") WHERE (migrated_from_category_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_agents_status" ON "agents" USING btree ("account_id","status") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_user_id" ON "ai_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_messages_content_embedding" ON "ai_messages" USING hnsw ("content_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_ai_messages_conversation_id" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_ai_provider_configs_account_id" ON "ai_provider_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_ai_provider_configs_is_active" ON "ai_provider_configs" USING btree ("is_active") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_api_keys_account" ON "api_keys" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_prefix" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "autopilot_triggers_webhook_token" ON "autopilot_triggers" USING btree ("webhook_token") WHERE (webhook_token IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_autopilot_triggers_autopilot" ON "autopilot_triggers" USING btree ("autopilot_id");--> statement-breakpoint
CREATE INDEX "idx_autopilot_triggers_due" ON "autopilot_triggers" USING btree ("next_run_at" NULLS FIRST) WHERE ((enabled = true) AND (kind = 'schedule'::text));--> statement-breakpoint
CREATE INDEX "idx_backbone_connections_account" ON "backbone_connections" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_backbone_connections_default" ON "backbone_connections" USING btree ("account_id","is_default") WHERE (is_default = true);--> statement-breakpoint
CREATE INDEX "idx_backbone_connections_type" ON "backbone_connections" USING btree ("backbone_type");--> statement-breakpoint
CREATE INDEX "idx_board_instances_account" ON "board_instances" USING btree ("account_id") WHERE (NOT is_archived);--> statement-breakpoint
CREATE INDEX "idx_board_instances_backbone" ON "board_instances" USING btree ("backbone_connection_id");--> statement-breakpoint
CREATE INDEX "idx_board_instances_default_category" ON "board_instances" USING btree ("default_category_id") WHERE (default_category_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_board_instances_favorite" ON "board_instances" USING btree ("account_id","is_favorite") WHERE (NOT is_archived);--> statement-breakpoint
CREATE INDEX "idx_board_instances_pod" ON "board_instances" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "idx_board_integration_refs_board" ON "board_integration_refs" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "idx_board_integration_refs_connection" ON "board_integration_refs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_board_routes_account" ON "board_routes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_board_routes_source" ON "board_routes" USING btree ("source_board_id");--> statement-breakpoint
CREATE INDEX "idx_board_routes_source_trigger" ON "board_routes" USING btree ("source_board_id","trigger","is_active");--> statement-breakpoint
CREATE INDEX "idx_board_steps_board" ON "board_steps" USING btree ("board_instance_id");--> statement-breakpoint
CREATE INDEX "idx_board_steps_category" ON "board_steps" USING btree ("linked_category_id") WHERE (linked_category_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_board_steps_default_agent" ON "board_steps" USING btree ("default_agent_id") WHERE (default_agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_board_steps_error" ON "board_steps" USING btree ("on_error_step_id") WHERE (on_error_step_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_board_steps_success" ON "board_steps" USING btree ("on_success_step_id") WHERE (on_success_step_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_card_executions_card" ON "card_executions" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "idx_card_executions_step" ON "card_executions" USING btree ("board_step_id");--> statement-breakpoint
CREATE INDEX "idx_categories_account_id" ON "categories" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_category_skills_category" ON "category_skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_category_skills_skill" ON "category_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_account_id" ON "conversations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_agent_id" ON "conversations" USING btree ("agent_id") WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_conversations_board_id" ON "conversations" USING btree ("board_id") WHERE (board_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_conversations_pod" ON "conversations" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_task_id" ON "conversations" USING btree ("task_id") WHERE (task_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_conversations_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_updated" ON "conversations" USING btree ("user_id","updated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_dag_approvals_dag" ON "dag_approvals" USING btree ("dag_id");--> statement-breakpoint
CREATE INDEX "idx_dag_approvals_status" ON "dag_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_execution_log_account" ON "execution_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_execution_log_pod" ON "execution_log" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "idx_execution_log_started" ON "execution_log" USING btree ("started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_heartbeat_configs_account" ON "heartbeat_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_heartbeat_configs_active" ON "heartbeat_configs" USING btree ("is_active") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_ic_health_check" ON "integration_connections" USING btree ("last_checked_at") WHERE ((health_status)::text <> 'unknown'::text);--> statement-breakpoint
CREATE INDEX "idx_integration_connections_account" ON "integration_connections" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_integration_connections_definition" ON "integration_connections" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_integration_connections_status" ON "integration_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_integration_connections_token_expiry" ON "integration_connections" USING btree ("token_expires_at") WHERE (token_expires_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_integration_definitions_account" ON "integration_definitions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_integration_definitions_auth_type" ON "integration_definitions" USING btree ("auth_type");--> statement-breakpoint
CREATE INDEX "idx_integration_definitions_system" ON "integration_definitions" USING btree ("is_system") WHERE (is_system = true);--> statement-breakpoint
CREATE INDEX "idx_integration_tools_account" ON "integration_tools" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_integration_tools_def" ON "integration_tools" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_docs_account_id" ON "knowledge_docs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_docs_agent_id" ON "knowledge_docs" USING btree ("agent_id") WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_knowledge_docs_category_id" ON "knowledge_docs" USING btree ("category_id") WHERE (category_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_knowledge_docs_master" ON "knowledge_docs" USING btree ("account_id","category_id","is_master") WHERE (is_master = true);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_docs_unique_master" ON "knowledge_docs" USING btree ("account_id","category_id") WHERE ((is_master = true) AND (category_id IS NOT NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_docs_unique_master_uncategorized" ON "knowledge_docs" USING btree ("account_id") WHERE ((is_master = true) AND (category_id IS NULL));--> statement-breakpoint
CREATE INDEX "idx_knowledge_docs_updated" ON "knowledge_docs" USING btree ("account_id","updated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_memory_connections_account" ON "memory_connections" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memory_connections_account_default" ON "memory_connections" USING btree ("account_id") WHERE (is_account_default = true);--> statement-breakpoint
CREATE INDEX "idx_messages_author" ON "messages" USING btree ("author_type","author_id") WHERE (author_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_messages_kind" ON "messages" USING btree ("conversation_id","kind");--> statement-breakpoint
CREATE INDEX "idx_messages_search" ON "messages" USING gin ("search_index" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_orchestrated_task_deps_downstream" ON "orchestrated_task_deps" USING btree ("downstream_task_id");--> statement-breakpoint
CREATE INDEX "idx_orchestrated_tasks_account_status" ON "orchestrated_tasks" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "idx_orchestrated_tasks_parent_id" ON "orchestrated_tasks" USING btree ("parent_orchestrated_task_id");--> statement-breakpoint
CREATE INDEX "idx_orchestrated_tasks_pod_id" ON "orchestrated_tasks" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "idx_orchestrated_tasks_stale" ON "orchestrated_tasks" USING btree ("status","updated_at") WHERE (status = 'running'::text);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reset_tokens_hash" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_reset_tokens_user" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pilot_configs_account" ON "pilot_configs" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pilot_configs_account_pod" ON "pilot_configs" USING btree ("account_id","pod_id");--> statement-breakpoint
CREATE INDEX "idx_pilot_configs_active" ON "pilot_configs" USING btree ("is_active") WHERE (is_active = true);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pilot_configs_unique" ON "pilot_configs" USING btree ("account_id","pod_id");--> statement-breakpoint
CREATE INDEX "idx_pods_account" ON "pods" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_pods_pilot_agent" ON "pods" USING btree ("pilot_agent_id") WHERE (pilot_agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_pods_search" ON "pods" USING gin ("search_index" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_description_embedding" ON "projects" USING hnsw ("description_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_provider_agents_account" ON "provider_agents" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_provider_agents_agent_id" ON "provider_agents" USING btree ("agent_id") WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_provider_agents_category" ON "provider_agents" USING btree ("account_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_provider_agents_retry" ON "provider_agents" USING btree ("next_retry_at") WHERE ((sync_status = 'error'::text) AND (next_retry_at IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_provider_agents_sync_status" ON "provider_agents" USING btree ("sync_status") WHERE (sync_status = ANY (ARRAY['pending'::text, 'stale'::text, 'error'::text]));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_semaphore_account_resource" ON "semaphore_leases" USING btree ("account_id","resource_key");--> statement-breakpoint
CREATE INDEX "idx_semaphore_expires_at" ON "semaphore_leases" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_skills_account_id" ON "skills" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_skills_account_type" ON "skills" USING btree ("account_id","skill_type");--> statement-breakpoint
CREATE INDEX "idx_skills_active" ON "skills" USING btree ("account_id","is_active") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_skills_name" ON "skills" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "idx_skills_search" ON "skills" USING gin ("search_index" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_skills_source_sync" ON "skills" USING btree ("source_sync_id") WHERE (source_sync_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_skills_source_type" ON "skills" USING btree ("account_id","source_type");--> statement-breakpoint
CREATE INDEX "idx_skills_type" ON "skills" USING btree ("skill_type");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_source_uri_unique" ON "skills" USING btree ("account_id","source_type","source_uri") WHERE (source_uri IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_sources_account_id" ON "sources" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_sources_category_id" ON "sources" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_sources_connection_id" ON "sources" USING btree ("connection_id") WHERE (connection_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_sources_sync_status" ON "sources" USING btree ("sync_status") WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_sync_jobs_source_id" ON "sync_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_sync_jobs_started_at" ON "sync_jobs" USING btree ("started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_sync_jobs_status" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sync_runs_status_recent" ON "sync_runs" USING btree ("status","started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_sync_runs_sync" ON "sync_runs" USING btree ("sync_id","started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_syncs_account" ON "syncs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_syncs_due" ON "syncs" USING btree ("last_run_at" NULLS FIRST) WHERE (enabled = true);--> statement-breakpoint
CREATE INDEX "idx_syncs_type" ON "syncs" USING btree ("account_id","sync_type");--> statement-breakpoint
CREATE INDEX "idx_system_settings_extended" ON "system_settings" USING gin ("extended_settings");--> statement-breakpoint
CREATE INDEX "idx_task_dags_account" ON "task_dags" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_task_deps_dag" ON "task_dependencies" USING btree ("dag_id");--> statement-breakpoint
CREATE INDEX "idx_task_deps_source" ON "task_dependencies" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX "idx_task_deps_target" ON "task_dependencies" USING btree ("target_task_id");--> statement-breakpoint
CREATE INDEX "idx_task_runs_account_recent" ON "task_runs" USING btree ("account_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_task_runs_active" ON "task_runs" USING btree ("account_id","status","created_at" DESC NULLS FIRST) WHERE (status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'running'::text]));--> statement-breakpoint
CREATE INDEX "idx_task_runs_agent" ON "task_runs" USING btree ("agent_id","created_at" DESC NULLS FIRST) WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_task_runs_orch" ON "task_runs" USING btree ("orchestrated_task_id","created_at" DESC NULLS FIRST) WHERE (orchestrated_task_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_task_runs_pod_status" ON "task_runs" USING btree ("pod_id","status","created_at" DESC NULLS FIRST) WHERE (pod_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_task_runs_task" ON "task_runs" USING btree ("task_id","created_at" DESC NULLS FIRST) WHERE (task_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tasks_account_id" ON "tasks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_agent_assignee" ON "tasks" USING btree ("assignee_id") WHERE ((assignee_type)::text = 'agent'::text);--> statement-breakpoint
CREATE INDEX "idx_tasks_board" ON "tasks" USING btree ("board_instance_id") WHERE (board_instance_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tasks_category_id" ON "tasks" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_completed" ON "tasks" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "idx_tasks_creator_agent" ON "tasks" USING btree ("creator_id") WHERE (creator_type = 'agent'::text);--> statement-breakpoint
CREATE INDEX "idx_tasks_creator_user" ON "tasks" USING btree ("creator_id") WHERE (creator_type = 'user'::text);--> statement-breakpoint
CREATE INDEX "idx_tasks_external_id" ON "tasks" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_human_assignee" ON "tasks" USING btree ("assignee_id") WHERE ((assignee_type)::text = 'human'::text);--> statement-breakpoint
CREATE INDEX "idx_tasks_mention_chain" ON "tasks" USING btree (((input_context ->> 'source_task_id'::text))) WHERE ((input_context ->> 'trigger'::text) = 'mention'::text);--> statement-breakpoint
CREATE INDEX "idx_tasks_override_category" ON "tasks" USING btree ("override_category_id") WHERE (override_category_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_tasks_search" ON "tasks" USING gin ("search_index" tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_tasks_source_id" ON "tasks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_step" ON "tasks" USING btree ("current_step_id") WHERE (current_step_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_token_usage_agent" ON "token_usage" USING btree ("agent_id","created_at" DESC NULLS FIRST) WHERE (agent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_token_usage_pod" ON "token_usage" USING btree ("pod_id","created_at" DESC NULLS FIRST) WHERE (pod_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_token_usage_provider_model" ON "token_usage" USING btree ("account_id","provider","model");--> statement-breakpoint
CREATE INDEX "idx_token_usage_daily_account_day" ON "token_usage_daily" USING btree ("account_id","day" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "token_usage_daily_unique" ON "token_usage_daily" USING btree (account_id,day,COALESCE(pod_id, '00000000-0000-0000-0000-000000000000'::uuid),COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid),provider,model);--> statement-breakpoint
CREATE INDEX "idx_users_profile_embedding" ON "users" USING hnsw ("profile_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_users_email_lower" ON "users" USING btree (lower(email));--> statement-breakpoint
CREATE INDEX "idx_waitlist_email" ON "waitlist" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_retry" ON "webhook_deliveries" USING btree ("next_retry_at") WHERE (((status)::text = 'pending'::text) AND (next_retry_at IS NOT NULL));--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries" USING btree ("status") WHERE ((status)::text = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_webhook" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "idx_webhooks_account" ON "webhooks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_webhooks_active" ON "webhooks" USING btree ("account_id","active") WHERE (active = true);