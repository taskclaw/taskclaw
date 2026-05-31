import { pgTable, index, foreignKey, check, uuid, text, jsonb, timestamp, boolean, integer, unique, varchar, bigint, numeric, vector, uniqueIndex, date, doublePrecision, primaryKey } from "drizzle-orm/pg-core"
import { tsvector } from "./custom-types";
import { sql } from "drizzle-orm"



export const syncs = pgTable("syncs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: text().notNull(),
	syncType: text("sync_type").notNull(),
	sourceKind: text("source_kind").notNull(),
	config: jsonb().default({}).notNull(),
	scheduleCron: text("schedule_cron"),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	lastStatus: text("last_status"),
	lastError: text("last_error"),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_syncs_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_syncs_due").using("btree", table.lastRunAt.asc().nullsFirst()).where(sql`(enabled = true)`),
	index("idx_syncs_type").using("btree", table.accountId.asc().nullsLast(), table.syncType.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "syncs_account_id_fkey"
		}).onDelete("cascade"),
	check("syncs_last_status_check", sql`last_status = ANY (ARRAY['ok'::text, 'error'::text, 'partial'::text, 'running'::text])`),
	check("syncs_source_kind_check", sql`source_kind = ANY (ARRAY['local-folder'::text, 'git-repo'::text, 'marketplace'::text, 'notion'::text, 'gdrive'::text])`),
	check("syncs_sync_type_check", sql`sync_type = ANY (ARRAY['skills'::text, 'knowledge'::text, 'pods'::text])`),
]);

export const syncRuns = pgTable("sync_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	syncId: uuid("sync_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	itemsAdded: integer("items_added").default(0).notNull(),
	itemsUpdated: integer("items_updated").default(0).notNull(),
	itemsRemoved: integer("items_removed").default(0).notNull(),
	logExcerpt: text("log_excerpt"),
	trigger: text().notNull(),
}, (table) => [
	index("idx_sync_runs_status_recent").using("btree", table.status.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	index("idx_sync_runs_sync").using("btree", table.syncId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.syncId],
			foreignColumns: [syncs.id],
			name: "sync_runs_sync_id_fkey"
		}).onDelete("cascade"),
	check("sync_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text, 'partial'::text, 'cancelled'::text])`),
	check("sync_runs_trigger_check", sql`trigger = ANY (ARRAY['schedule'::text, 'manual'::text, 'hook'::text])`),
]);

export const integrationDefinitions = pgTable("integration_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id"),
	slug: varchar({ length: 100 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	description: text(),
	icon: varchar({ length: 50 }),
	categories: text().array().default(sql`'{}'`),
	authType: varchar("auth_type", { length: 20 }).notNull(),
	authConfig: jsonb("auth_config").default({}),
	configFields: jsonb("config_fields").default([]),
	skillId: uuid("skill_id"),
	setupGuide: text("setup_guide"),
	isSystem: boolean("is_system").default(false),
	proxyBaseUrl: varchar("proxy_base_url", { length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_integration_definitions_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_integration_definitions_auth_type").using("btree", table.authType.asc().nullsLast()),
	index("idx_integration_definitions_system").using("btree", table.isSystem.asc().nullsLast()).where(sql`(is_system = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "integration_definitions_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "integration_definitions_skill_id_fkey"
		}).onDelete("set null"),
	unique("integration_definitions_unique_slug").on(table.accountId, table.slug),
	check("integration_definitions_auth_type_check", sql`(auth_type)::text = ANY ((ARRAY['api_key'::character varying, 'oauth2'::character varying, 'webhook'::character varying, 'basic'::character varying, 'none'::character varying])::text[])`),
]);

export const backboneDefinitions = pgTable("backbone_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	icon: text().default('bot').notNull(),
	color: text().default('#6366f1').notNull(),
	protocol: text().notNull(),
	supportsStreaming: boolean("supports_streaming").default(true),
	supportsHeartbeat: boolean("supports_heartbeat").default(false),
	supportsAgentMode: boolean("supports_agent_mode").default(false),
	supportsToolUse: boolean("supports_tool_use").default(false),
	supportsFileAccess: boolean("supports_file_access").default(false),
	supportsCodeExecution: boolean("supports_code_execution").default(false),
	configSchema: jsonb("config_schema").default({}).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("backbone_definitions_slug_key").on(table.slug),
	check("backbone_definitions_protocol_check", sql`protocol = ANY (ARRAY['websocket'::text, 'http'::text, 'mcp'::text, 'cli'::text])`),
]);

export const backboneConnections = pgTable("backbone_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	backboneType: text("backbone_type").notNull(),
	name: text().notNull(),
	description: text(),
	config: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true),
	isDefault: boolean("is_default").default(false),
	healthStatus: text("health_status").default('unknown'),
	healthCheckedAt: timestamp("health_checked_at", { withTimezone: true, mode: 'string' }),
	healthError: text("health_error"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalRequests: bigint("total_requests", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalTokens: bigint("total_tokens", { mode: "number" }).default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_backbone_connections_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_backbone_connections_default").using("btree", table.accountId.asc().nullsLast(), table.isDefault.asc().nullsLast()).where(sql`(is_default = true)`),
	index("idx_backbone_connections_type").using("btree", table.backboneType.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "backbone_connections_account_id_fkey"
		}).onDelete("cascade"),
	check("backbone_connections_health_status_check", sql`health_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'unknown'::text])`),
]);

export const apiKeys = pgTable("api_keys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	userId: uuid("user_id").notNull(),
	keyHash: text("key_hash").notNull(),
	keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	scopes: jsonb().default([]).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_api_keys_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_api_keys_prefix").using("btree", table.keyPrefix.asc().nullsLast()),
	index("idx_api_keys_user").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "api_keys_account_id_fkey"
		}).onDelete("cascade"),
]);

export const pods = pgTable("pods", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	icon: text().default('layers'),
	color: text().default('#6366f1'),
	backboneConnectionId: uuid("backbone_connection_id"),
	agentConfig: jsonb("agent_config").default({}),
	position: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	pilotAgentId: uuid("pilot_agent_id"),
	autonomyLevel: integer("autonomy_level").default(1).notNull(),
	searchIndex: tsvector("search_index").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE(description, ''::text)))`),
}, (table) => [
	index("idx_pods_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_pods_pilot_agent").using("btree", table.pilotAgentId.asc().nullsLast()).where(sql`(pilot_agent_id IS NOT NULL)`),
	index("idx_pods_search").using("gin", table.searchIndex.asc().nullsLast().op("tsvector_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "pods_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "pods_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.pilotAgentId],
			foreignColumns: [agents.id],
			name: "pods_pilot_agent_id_fkey"
		}).onDelete("set null"),
	unique("pods_account_id_slug_key").on(table.accountId, table.slug),
	check("pods_autonomy_level_check", sql`(autonomy_level >= 1) AND (autonomy_level <= 4)`),
]);

export const webhooks = pgTable("webhooks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	url: text().notNull(),
	secret: text().notNull(),
	events: text().array().default(sql`'{}'`).notNull(),
	active: boolean().default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_webhooks_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_webhooks_active").using("btree", table.accountId.asc().nullsLast(), table.active.asc().nullsLast()).where(sql`(active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "webhooks_account_id_fkey"
		}).onDelete("cascade"),
]);

export const messages = pgTable("messages", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	role: text().notNull(),
	content: text().notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	backboneConnectionId: uuid("backbone_connection_id"),
	kind: text().default('text').notNull(),
	authorType: text("author_type"),
	authorId: uuid("author_id"),
	searchIndex: tsvector("search_index").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, COALESCE(content, ''::text))`),
}, (table) => [
	index("idx_messages_author").using("btree", table.authorType.asc().nullsLast(), table.authorId.asc().nullsLast()).where(sql`(author_id IS NOT NULL)`),
	index("idx_messages_conversation_created").using("btree", table.conversationId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	index("idx_messages_conversation_id").using("btree", table.conversationId.asc().nullsLast()),
	index("idx_messages_created_at").using("btree", table.createdAt.desc().nullsFirst()),
	index("idx_messages_kind").using("btree", table.conversationId.asc().nullsLast(), table.kind.asc().nullsLast()),
	index("idx_messages_search").using("gin", table.searchIndex.asc().nullsLast().op("tsvector_ops")),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "messages_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "messages_conversation_id_fkey"
		}).onDelete("cascade"),
	check("messages_author_type_check", sql`author_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text])`),
	check("messages_kind_check", sql`kind = ANY (ARRAY['text'::text, 'thinking'::text, 'tool_use'::text, 'tool_result'::text, 'status'::text, 'error'::text, 'log'::text])`),
	check("messages_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])`),
]);

export const agents = pgTable("agents", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	avatarUrl: text("avatar_url"),
	description: text(),
	persona: text(),
	color: varchar({ length: 7 }),
	backboneConnectionId: uuid("backbone_connection_id"),
	modelOverride: varchar("model_override", { length: 100 }),
	maxConcurrentTasks: integer("max_concurrent_tasks").default(3),
	status: varchar({ length: 20 }).default('idle').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	agentType: varchar("agent_type", { length: 20 }).default('worker').notNull(),
	totalTasksCompleted: integer("total_tasks_completed").default(0),
	totalTasksFailed: integer("total_tasks_failed").default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalTokensUsed: bigint("total_tokens_used", { mode: "number" }).default(0),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	config: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	migratedFromCategoryId: uuid("migrated_from_category_id"),
	customEnv: jsonb("custom_env").default({}).notNull(),
	customArgs: jsonb("custom_args").default([]).notNull(),
}, (table) => [
	index("idx_agents_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_agents_migrated_from_category").using("btree", table.migratedFromCategoryId.asc().nullsLast()).where(sql`(migrated_from_category_id IS NOT NULL)`),
	index("idx_agents_status").using("btree", table.accountId.asc().nullsLast(), table.status.asc().nullsLast()).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "agents_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "agents_backbone_connection_id_fkey"
		}).onDelete("set null"),
	unique("agents_unique_slug_per_account").on(table.accountId, table.slug),
	check("agents_custom_args_array", sql`jsonb_typeof(custom_args) = 'array'::text`),
	check("agents_custom_env_object", sql`jsonb_typeof(custom_env) = 'object'::text`),
	check("agents_status_check", sql`(status)::text = ANY ((ARRAY['idle'::character varying, 'working'::character varying, 'paused'::character varying, 'error'::character varying, 'offline'::character varying])::text[])`),
	check("agents_type_check", sql`(agent_type)::text = ANY ((ARRAY['worker'::character varying, 'pilot'::character varying, 'coordinator'::character varying])::text[])`),
]);

export const boardRoutes = pgTable("board_routes", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	sourceBoardId: uuid("source_board_id").notNull(),
	sourceStepId: uuid("source_step_id"),
	targetBoardId: uuid("target_board_id").notNull(),
	targetStepId: uuid("target_step_id"),
	trigger: text().default('auto').notNull(),
	transformConfig: jsonb("transform_config").default({}),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	triggerOnStepComplete: boolean("trigger_on_step_complete").default(true),
	label: text(),
	conditions: jsonb().default({}),
	podId: uuid("pod_id"),
}, (table) => [
	index("idx_board_routes_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_board_routes_source").using("btree", table.sourceBoardId.asc().nullsLast()),
	index("idx_board_routes_source_trigger").using("btree", table.sourceBoardId.asc().nullsLast(), table.trigger.asc().nullsLast(), table.isActive.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "board_routes_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "board_routes_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.sourceBoardId],
			foreignColumns: [boardInstances.id],
			name: "board_routes_source_board_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceStepId],
			foreignColumns: [boardSteps.id],
			name: "board_routes_source_step_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.targetBoardId],
			foreignColumns: [boardInstances.id],
			name: "board_routes_target_board_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetStepId],
			foreignColumns: [boardSteps.id],
			name: "board_routes_target_step_id_fkey"
		}).onDelete("set null"),
	check("board_routes_trigger_check", sql`trigger = ANY (ARRAY['auto'::text, 'manual'::text, 'ai_decision'::text, 'error'::text, 'fallback'::text])`),
]);

export const taskDags = pgTable("task_dags", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	podId: uuid("pod_id"),
	goal: text().notNull(),
	status: text().default('pending').notNull(),
	createdBy: text("created_by").default('human').notNull(),
	conversationId: uuid("conversation_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_task_dags_account").using("btree", table.accountId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "task_dags_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "task_dags_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "task_dags_pod_id_fkey"
		}).onDelete("set null"),
	check("task_dags_status_check", sql`status = ANY (ARRAY['pending_approval'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])`),
]);

export const integrationTools = pgTable("integration_tools", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	definitionId: uuid("definition_id"),
	accountId: uuid("account_id"),
	name: varchar({ length: 100 }).notNull(),
	displayName: varchar("display_name", { length: 200 }).notNull(),
	description: text().notNull(),
	httpMethod: varchar("http_method", { length: 10 }).default('POST').notNull(),
	endpointTemplate: varchar("endpoint_template", { length: 500 }).notNull(),
	authHeaderName: varchar("auth_header_name", { length: 100 }),
	authCredentialKey: varchar("auth_credential_key", { length: 100 }),
	requestBodySchema: jsonb("request_body_schema"),
	responseSchema: jsonb("response_schema"),
	responseExtract: varchar("response_extract", { length: 200 }),
	isStreaming: boolean("is_streaming").default(false),
	timeoutSeconds: integer("timeout_seconds").default(300),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_integration_tools_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_integration_tools_def").using("btree", table.definitionId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "integration_tools_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [integrationDefinitions.id],
			name: "integration_tools_definition_id_fkey"
		}).onDelete("cascade"),
]);

export const tokenUsage = pgTable("token_usage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	messageId: uuid("message_id"),
	taskId: uuid("task_id"),
	agentId: uuid("agent_id"),
	podId: uuid("pod_id"),
	conversationId: uuid("conversation_id"),
	provider: text().notNull(),
	model: text().notNull(),
	inputTokens: integer("input_tokens").default(0).notNull(),
	outputTokens: integer("output_tokens").default(0).notNull(),
	cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
	cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
	estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale:  6 }),
	latencyMs: integer("latency_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_token_usage_agent").using("btree", table.agentId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(agent_id IS NOT NULL)`),
	index("idx_token_usage_pod").using("btree", table.podId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(pod_id IS NOT NULL)`),
	index("idx_token_usage_provider_model").using("btree", table.accountId.asc().nullsLast(), table.provider.asc().nullsLast(), table.model.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "token_usage_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "token_usage_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "token_usage_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.id],
			name: "token_usage_message_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "token_usage_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "token_usage_task_id_fkey"
		}).onDelete("set null"),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	name: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	status: text().default('pending').notNull(),
	profileEmbedding: vector("profile_embedding", { dimensions: 1536 }),
	// Local auth (Epic 1) — replaces GoTrue. bcrypt hash so existing $2a$ hashes verify.
	passwordHash: text("password_hash"),
	emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true, mode: 'string' }),
	lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_users_profile_embedding").using("hnsw", table.profileEmbedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_users_email_lower").using("btree", sql`lower(email)`),
	unique("users_email_key").on(table.email),
	check("users_status_check", sql`status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text])`),
]);

// Opaque refresh tokens (sha256-stored) with rotation + family reuse-detection (Epic 1).
export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	familyId: uuid("family_id").defaultRandom().notNull(),
	parentId: uuid("parent_id"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	replacedBy: uuid("replaced_by"),
	userAgent: text("user_agent"),
	ip: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("idx_refresh_tokens_hash").using("btree", table.tokenHash.asc().nullsLast()),
	index("idx_refresh_tokens_user").using("btree", table.userId.asc().nullsLast()),
	index("idx_refresh_tokens_family").using("btree", table.familyId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_fkey"
		}).onDelete("cascade"),
]);

// Single-use password-reset tokens (sha256-stored) (Epic 1).
export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("idx_reset_tokens_hash").using("btree", table.tokenHash.asc().nullsLast()),
	index("idx_reset_tokens_user").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "password_reset_tokens_user_id_fkey"
		}).onDelete("cascade"),
]);

export const executionLog = pgTable("execution_log", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	triggerType: text("trigger_type").notNull(),
	status: text().notNull(),
	podId: uuid("pod_id"),
	boardId: uuid("board_id"),
	taskId: uuid("task_id"),
	dagId: uuid("dag_id"),
	heartbeatConfigId: uuid("heartbeat_config_id"),
	routeId: uuid("route_id"),
	conversationId: uuid("conversation_id"),
	summary: text(),
	errorDetails: text("error_details"),
	durationMs: integer("duration_ms"),
	metadata: jsonb().default({}),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_execution_log_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_execution_log_pod").using("btree", table.podId.asc().nullsLast()),
	index("idx_execution_log_started").using("btree", table.startedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "execution_log_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.boardId],
			foreignColumns: [boardInstances.id],
			name: "execution_log_board_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "execution_log_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.dagId],
			foreignColumns: [taskDags.id],
			name: "execution_log_dag_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.heartbeatConfigId],
			foreignColumns: [heartbeatConfigs.id],
			name: "execution_log_heartbeat_config_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "execution_log_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [boardRoutes.id],
			name: "execution_log_route_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "execution_log_task_id_fkey"
		}).onDelete("set null"),
	check("execution_log_status_check", sql`status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text, 'running'::text, 'timeout'::text, 'dry_run'::text])`),
	check("execution_log_trigger_type_check", sql`trigger_type = ANY (ARRAY['heartbeat'::text, 'dag_step'::text, 'route_transfer'::text, 'tool_execution'::text, 'coordinator'::text, 'manual'::text, 'workspace_chat'::text])`),
]);

export const syncJobs = pgTable("sync_jobs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	sourceId: uuid("source_id").notNull(),
	direction: text().notNull(),
	status: text().notNull(),
	tasksSynced: integer("tasks_synced").default(0),
	tasksCreated: integer("tasks_created").default(0),
	tasksUpdated: integer("tasks_updated").default(0),
	tasksDeleted: integer("tasks_deleted").default(0),
	errorLog: text("error_log"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_sync_jobs_source_id").using("btree", table.sourceId.asc().nullsLast()),
	index("idx_sync_jobs_started_at").using("btree", table.startedAt.desc().nullsFirst()),
	index("idx_sync_jobs_status").using("btree", table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sources.id],
			name: "sync_jobs_source_id_fkey"
		}).onDelete("cascade"),
	check("sync_jobs_direction_check", sql`direction = ANY (ARRAY['inbound'::text, 'outbound'::text])`),
	check("sync_jobs_status_check", sql`status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])`),
]);

export const aiMessages = pgTable("ai_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	role: text().notNull(),
	content: text(),
	toolCalls: jsonb("tool_calls"),
	toolCallId: text("tool_call_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	contentEmbedding: vector("content_embedding", { dimensions: 1536 }),
}, (table) => [
	index("idx_ai_messages_content_embedding").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_ai_messages_conversation_id").using("btree", table.conversationId.asc().nullsLast()),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [aiConversations.id],
			name: "ai_messages_conversation_id_fkey"
		}).onDelete("cascade"),
]);

export const accountUsers = pgTable("account_users", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	userId: uuid("user_id"),
	role: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "account_users_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_users_user_id_fkey"
		}).onDelete("cascade"),
	unique("account_users_account_id_user_id_key").on(table.accountId, table.userId),
	check("account_users_role_check", sql`role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])`),
]);

export const projectUsers = pgTable("project_users", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	projectId: uuid("project_id"),
	userId: uuid("user_id"),
	role: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_users_project_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "project_users_user_id_fkey"
		}).onDelete("cascade"),
	unique("project_users_project_id_user_id_key").on(table.projectId, table.userId),
	check("project_users_role_check", sql`role = ANY (ARRAY['admin'::text, 'editor'::text, 'viewer'::text])`),
]);

export const tokenUsageDaily = pgTable("token_usage_daily", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	day: date().notNull(),
	podId: uuid("pod_id"),
	agentId: uuid("agent_id"),
	provider: text().notNull(),
	model: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalInputTokens: bigint("total_input_tokens", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalOutputTokens: bigint("total_output_tokens", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCacheReadTokens: bigint("total_cache_read_tokens", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCacheWriteTokens: bigint("total_cache_write_tokens", { mode: "number" }).default(0).notNull(),
	totalCostUsd: numeric("total_cost_usd", { precision: 14, scale:  6 }).default('0').notNull(),
	callCount: integer("call_count").default(0).notNull(),
	rolledUpAt: timestamp("rolled_up_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_token_usage_daily_account_day").using("btree", table.accountId.asc().nullsLast(), table.day.desc().nullsFirst()),
	uniqueIndex("token_usage_daily_unique").using("btree", sql`account_id`, sql`day`, sql`COALESCE(pod_id, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`provider`, sql`model`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "token_usage_daily_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "token_usage_daily_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "token_usage_daily_pod_id_fkey"
		}).onDelete("set null"),
]);

export const invitations = pgTable("invitations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	email: text().notNull(),
	role: text().notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "invitations_account_id_fkey"
		}).onDelete("cascade"),
	unique("invitations_account_id_email_key").on(table.accountId, table.email),
	unique("invitations_token_key").on(table.token),
	check("invitations_role_check", sql`role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])`),
]);

export const accounts = pgTable("accounts", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: text().notNull(),
	ownerUserId: uuid("owner_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	onboardingCompleted: boolean("onboarding_completed").default(false),
}, (table) => [
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: "accounts_owner_user_id_fkey"
		}).onDelete("set null"),
]);

export const agentSyncLogs = pgTable("agent_sync_logs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	providerAgentId: uuid("provider_agent_id").notNull(),
	accountId: uuid("account_id").notNull(),
	action: text().notNull(),
	status: text().notNull(),
	instructionsHash: text("instructions_hash"),
	errorMessage: text("error_message"),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_agent_sync_logs_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_agent_sync_logs_agent").using("btree", table.providerAgentId.asc().nullsLast()),
	index("idx_agent_sync_logs_created").using("btree", table.createdAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.providerAgentId],
			foreignColumns: [providerAgents.id],
			name: "agent_sync_logs_provider_agent_id_fkey"
		}).onDelete("cascade"),
	check("agent_sync_logs_action_check", sql`action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'verify'::text])`),
	check("agent_sync_logs_status_check", sql`status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])`),
]);

export const cardExecutions = pgTable("card_executions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	boardStepId: uuid("board_step_id").notNull(),
	status: text().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	systemPromptUsed: text("system_prompt_used"),
	aiRequest: jsonb("ai_request"),
	aiResponse: jsonb("ai_response"),
	tokensUsed: jsonb("tokens_used"),
	outputData: jsonb("output_data"),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0),
	routedToStepKey: text("routed_to_step_key"),
	routingReason: text("routing_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_card_executions_card").using("btree", table.cardId.asc().nullsLast()),
	index("idx_card_executions_step").using("btree", table.boardStepId.asc().nullsLast()),
	foreignKey({
			columns: [table.boardStepId],
			foreignColumns: [boardSteps.id],
			name: "card_executions_board_step_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [tasks.id],
			name: "card_executions_card_id_fkey"
		}).onDelete("cascade"),
	check("card_executions_status_check", sql`status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])`),
]);

export const systemSettings = pgTable("system_settings", {
	id: boolean().default(true).primaryKey().notNull(),
	allowMultipleProjects: boolean("allow_multiple_projects").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	themeSet: text("theme_set").default('corporate'),
	extendedSettings: jsonb("extended_settings").default({}),
	allowMultipleTeams: boolean("allow_multiple_teams").default(true),
}, (table) => [
	index("idx_system_settings_extended").using("gin", table.extendedSettings.asc().nullsLast()),
	check("system_settings_id_check", sql`id`),
	check("valid_theme_set", sql`theme_set = ANY (ARRAY['corporate'::text, 'funky'::text, 'blue'::text, 'red'::text, 'ocean-blue'::text, 'ruby-red'::text, 'emerald-green'::text, 'amber-gold'::text])`),
]);

export const projects = pgTable("projects", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	name: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	descriptionEmbedding: vector("description_embedding", { dimensions: 1536 }),
}, (table) => [
	index("idx_projects_description_embedding").using("hnsw", table.descriptionEmbedding.asc().nullsLast().op("vector_cosine_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "projects_account_id_fkey"
		}).onDelete("cascade"),
]);

export const integrationConnections = pgTable("integration_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	definitionId: uuid("definition_id").notNull(),
	credentials: text(),
	tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true, mode: 'string' }),
	scopes: text().array(),
	status: varchar({ length: 20 }).default('pending'),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	errorMessage: text("error_message"),
	config: jsonb().default({}),
	externalAccountName: varchar("external_account_name", { length: 255 }),
	testConversationId: uuid("test_conversation_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	healthStatus: varchar("health_status", { length: 20 }).default('unknown'),
	lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: 'string' }),
	lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true, mode: 'string' }),
	checkIntervalMinutes: integer("check_interval_minutes").default(5),
}, (table) => [
	index("idx_ic_health_check").using("btree", table.lastCheckedAt.asc().nullsLast()).where(sql`((health_status)::text <> 'unknown'::text)`),
	index("idx_integration_connections_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_integration_connections_definition").using("btree", table.definitionId.asc().nullsLast()),
	index("idx_integration_connections_status").using("btree", table.status.asc().nullsLast()),
	index("idx_integration_connections_token_expiry").using("btree", table.tokenExpiresAt.asc().nullsLast()).where(sql`(token_expires_at IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "integration_connections_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.definitionId],
			foreignColumns: [integrationDefinitions.id],
			name: "integration_connections_definition_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.testConversationId],
			foreignColumns: [conversations.id],
			name: "integration_connections_test_conversation_id_fkey"
		}),
	unique("integration_connections_unique_per_account").on(table.accountId, table.definitionId),
	check("integration_connections_check_interval_check", sql`(check_interval_minutes >= 1) AND (check_interval_minutes <= 1440)`),
	check("integration_connections_health_status_check", sql`(health_status)::text = ANY ((ARRAY['healthy'::character varying, 'unhealthy'::character varying, 'checking'::character varying, 'unknown'::character varying])::text[])`),
	check("integration_connections_status_check", sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'expired'::character varying, 'error'::character varying, 'revoked'::character varying])::text[])`),
]);

export const sources = pgTable("sources", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	provider: text().notNull(),
	config: jsonb().default({}).notNull(),
	syncStatus: text("sync_status").default('idle').notNull(),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	lastSyncError: text("last_sync_error"),
	syncIntervalMinutes: integer("sync_interval_minutes").default(30),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	syncFilters: jsonb("sync_filters").default([]).notNull(),
	categoryProperty: text("category_property"),
	connectionId: uuid("connection_id"),
}, (table) => [
	index("idx_sources_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_sources_category_id").using("btree", table.categoryId.asc().nullsLast()),
	index("idx_sources_connection_id").using("btree", table.connectionId.asc().nullsLast()).where(sql`(connection_id IS NOT NULL)`),
	index("idx_sources_sync_status").using("btree", table.syncStatus.asc().nullsLast()).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "sources_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "sources_category_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.connectionId],
			foreignColumns: [integrationConnections.id],
			name: "sources_connection_id_fkey"
		}).onDelete("set null"),
	check("sources_provider_check", sql`provider = ANY (ARRAY['notion'::text, 'clickup'::text, 'trello'::text, 'local'::text])`),
	check("sources_sync_status_check", sql`sync_status = ANY (ARRAY['idle'::text, 'syncing'::text, 'error'::text, 'disabled'::text])`),
]);

export const circuitBreakerStates = pgTable("circuit_breaker_states", {
	configId: uuid("config_id").primaryKey().notNull(),
	failureCount: integer("failure_count").default(0).notNull(),
	lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: 'string' }),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }),
	state: text().default('closed').notNull(),
});

export const dagApprovals = pgTable("dag_approvals", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	dagId: uuid("dag_id").notNull(),
	status: text().default('pending').notNull(),
	reviewerUserId: uuid("reviewer_user_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_dag_approvals_dag").using("btree", table.dagId.asc().nullsLast()),
	index("idx_dag_approvals_status").using("btree", table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.dagId],
			foreignColumns: [taskDags.id],
			name: "dag_approvals_dag_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewerUserId],
			foreignColumns: [users.id],
			name: "dag_approvals_reviewer_user_id_fkey"
		}).onDelete("set null"),
	check("dag_approvals_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const aiConversations = pgTable("ai_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: text().default('New Conversation').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isPublic: boolean("is_public").default(false),
}, (table) => [
	index("idx_ai_conversations_user_id").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ai_conversations_user_id_fkey"
		}).onDelete("cascade"),
]);

export const boardIntegrationRefs = pgTable("board_integration_refs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	boardId: uuid("board_id").notNull(),
	connectionId: uuid("connection_id").notNull(),
	isRequired: boolean("is_required").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_board_integration_refs_board").using("btree", table.boardId.asc().nullsLast()),
	index("idx_board_integration_refs_connection").using("btree", table.connectionId.asc().nullsLast()),
	foreignKey({
			columns: [table.boardId],
			foreignColumns: [boardInstances.id],
			name: "board_integration_refs_board_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.connectionId],
			foreignColumns: [integrationConnections.id],
			name: "board_integration_refs_connection_id_fkey"
		}).onDelete("cascade"),
	unique("board_integration_refs_unique").on(table.boardId, table.connectionId),
]);

export const aiProviderConfigs = pgTable("ai_provider_configs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	providerType: text("provider_type").default('openclaw').notNull(),
	apiUrl: text("api_url").notNull(),
	apiKey: text("api_key").notNull(),
	agentId: text("agent_id"),
	isActive: boolean("is_active").default(true),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	openrouterApiKey: text("openrouter_api_key"),
	telegramBotToken: text("telegram_bot_token"),
	braveSearchApiKey: text("brave_search_api_key"),
	migratedTo: uuid("migrated_to"),
}, (table) => [
	index("idx_ai_provider_configs_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_ai_provider_configs_is_active").using("btree", table.isActive.asc().nullsLast()).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "ai_provider_configs_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.migratedTo],
			foreignColumns: [backboneConnections.id],
			name: "ai_provider_configs_migrated_to_fkey"
		}),
	unique("ai_provider_configs_account_id_provider_type_key").on(table.accountId, table.providerType),
]);

export const categories = pgTable("categories", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	name: text().notNull(),
	color: text(),
	icon: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	visible: boolean().default(true).notNull(),
	preferredBackboneConnectionId: uuid("preferred_backbone_connection_id"),
}, (table) => [
	index("idx_categories_account_id").using("btree", table.accountId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "categories_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.preferredBackboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "categories_preferred_backbone_connection_id_fkey"
		}).onDelete("set null"),
	unique("categories_account_id_name_key").on(table.accountId, table.name),
]);

export const memoryConnections = pgTable("memory_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	adapterSlug: text("adapter_slug").default('default').notNull(),
	name: text().default('Default Memory').notNull(),
	config: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	isAccountDefault: boolean("is_account_default").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_memory_connections_account").using("btree", table.accountId.asc().nullsLast()),
	uniqueIndex("idx_memory_connections_account_default").using("btree", table.accountId.asc().nullsLast()).where(sql`(is_account_default = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "memory_connections_account_id_fkey"
		}).onDelete("cascade"),
]);

export const pilotConfigs = pgTable("pilot_configs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	podId: uuid("pod_id"),
	backboneConnectionId: uuid("backbone_connection_id"),
	systemPrompt: text("system_prompt").default('You are a project coordinator. Review the current state of tasks and boards, then suggest and execute actions to move work forward.').notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	maxTasksPerCycle: integer("max_tasks_per_cycle").default(10).notNull(),
	approvalRequired: boolean("approval_required").default(true).notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	lastRunSummary: text("last_run_summary"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_pilot_configs_account").using("btree", table.accountId.asc().nullsLast()),
	uniqueIndex("idx_pilot_configs_account_pod").using("btree", table.accountId.asc().nullsLast(), table.podId.asc().nullsLast()),
	index("idx_pilot_configs_active").using("btree", table.isActive.asc().nullsLast()).where(sql`(is_active = true)`),
	uniqueIndex("idx_pilot_configs_unique").using("btree", table.accountId.asc().nullsLast(), table.podId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "pilot_configs_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "pilot_configs_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "pilot_configs_pod_id_fkey"
		}).onDelete("cascade"),
]);

export const plans = pgTable("plans", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: text().notNull(),
	priceCents: integer("price_cents").notNull(),
	currency: text().default('usd'),
	interval: text().notNull(),
	features: jsonb(),
	isDefault: boolean("is_default").default(false),
	isHidden: boolean("is_hidden").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	stripePriceId: text("stripe_price_id"),
	stripeProductId: text("stripe_product_id"),
}, (table) => [
	check("plans_interval_check", sql`"interval" = ANY (ARRAY['month'::text, 'year'::text])`),
]);

export const conversations = pgTable("conversations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	taskId: uuid("task_id"),
	title: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	boardId: uuid("board_id"),
	backboneConnectionId: uuid("backbone_connection_id"),
	podId: uuid("pod_id"),
	isWorkspace: boolean("is_workspace").default(false),
	agentId: uuid("agent_id"),
}, (table) => [
	index("idx_conversations_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_conversations_agent_id").using("btree", table.agentId.asc().nullsLast()).where(sql`(agent_id IS NOT NULL)`),
	index("idx_conversations_board_id").using("btree", table.boardId.asc().nullsLast()).where(sql`(board_id IS NOT NULL)`),
	index("idx_conversations_pod").using("btree", table.podId.asc().nullsLast()),
	index("idx_conversations_task_id").using("btree", table.taskId.asc().nullsLast()).where(sql`(task_id IS NOT NULL)`),
	index("idx_conversations_user_id").using("btree", table.userId.asc().nullsLast()),
	index("idx_conversations_user_updated").using("btree", table.userId.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "conversations_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "conversations_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "conversations_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.boardId],
			foreignColumns: [boardInstances.id],
			name: "conversations_board_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "conversations_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "conversations_task_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "conversations_user_id_fkey"
		}).onDelete("cascade"),
]);

export const knowledgeDocs = pgTable("knowledge_docs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	categoryId: uuid("category_id"),
	title: text().notNull(),
	content: text().default("").notNull(),
	isMaster: boolean("is_master").default(false),
	fileAttachments: jsonb("file_attachments").default([]),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	agentId: uuid("agent_id"),
}, (table) => [
	index("idx_knowledge_docs_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_knowledge_docs_agent_id").using("btree", table.agentId.asc().nullsLast()).where(sql`(agent_id IS NOT NULL)`),
	index("idx_knowledge_docs_category_id").using("btree", table.categoryId.asc().nullsLast()).where(sql`(category_id IS NOT NULL)`),
	index("idx_knowledge_docs_master").using("btree", table.accountId.asc().nullsLast(), table.categoryId.asc().nullsLast(), table.isMaster.asc().nullsLast()).where(sql`(is_master = true)`),
	uniqueIndex("idx_knowledge_docs_unique_master").using("btree", table.accountId.asc().nullsLast(), table.categoryId.asc().nullsLast()).where(sql`((is_master = true) AND (category_id IS NOT NULL))`),
	uniqueIndex("idx_knowledge_docs_unique_master_uncategorized").using("btree", table.accountId.asc().nullsLast()).where(sql`((is_master = true) AND (category_id IS NULL))`),
	index("idx_knowledge_docs_updated").using("btree", table.accountId.asc().nullsLast(), table.updatedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "knowledge_docs_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "knowledge_docs_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "knowledge_docs_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "knowledge_docs_created_by_fkey"
		}).onDelete("set null"),
	check("knowledge_docs_content_size", sql`char_length(content) <= 102400`),
	check("knowledge_docs_title_not_empty", sql`char_length(TRIM(BOTH FROM title)) > 0`),
]);

export const agentMemories = pgTable("agent_memories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	content: text().notNull(),
	contentEmbedding: vector("content_embedding", { dimensions: 1536 }),
	type: text().default('episodic').notNull(),
	source: text().default('agent').notNull(),
	salience: doublePrecision().default(1).notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }).defaultNow(),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	taskId: uuid("task_id"),
	boardInstanceId: uuid("board_instance_id"),
	categoryId: uuid("category_id"),
	conversationId: uuid("conversation_id"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_agent_memories_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_agent_memories_conversation").using("btree", table.conversationId.asc().nullsLast()).where(sql`(conversation_id IS NOT NULL)`),
	index("idx_agent_memories_embedding").using("hnsw", table.contentEmbedding.asc().nullsLast().op("vector_cosine_ops")),
	index("idx_agent_memories_salience").using("btree", table.accountId.asc().nullsLast(), table.salience.desc().nullsFirst()),
	index("idx_agent_memories_task").using("btree", table.taskId.asc().nullsLast()).where(sql`(task_id IS NOT NULL)`),
	index("idx_agent_memories_type").using("btree", table.accountId.asc().nullsLast(), table.type.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "agent_memories_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.boardInstanceId],
			foreignColumns: [boardInstances.id],
			name: "agent_memories_board_instance_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "agent_memories_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "agent_memories_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "agent_memories_task_id_fkey"
		}).onDelete("set null"),
	check("agent_memories_source_check", sql`source = ANY (ARRAY['agent'::text, 'human'::text, 'sync'::text])`),
	check("agent_memories_type_check", sql`type = ANY (ARRAY['episodic'::text, 'semantic'::text, 'procedural'::text, 'working'::text])`),
]);

export const waitlist = pgTable("waitlist", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	source: text().default('landing_page'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_waitlist_email").using("btree", table.email.asc().nullsLast()),
	unique("waitlist_email_key").on(table.email),
]);

export const taskRuns = pgTable("task_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	taskId: uuid("task_id"),
	orchestratedTaskId: uuid("orchestrated_task_id"),
	podId: uuid("pod_id"),
	agentId: uuid("agent_id"),
	status: text().notNull(),
	attempt: integer().default(1).notNull(),
	maxAttempts: integer("max_attempts").default(2).notNull(),
	parentRunId: uuid("parent_run_id"),
	trigger: text().notNull(),
	failureReason: text("failure_reason"),
	failureMessage: text("failure_message"),
	result: jsonb(),
	metadata: jsonb().default({}).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_task_runs_account_recent").using("btree", table.accountId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_task_runs_active").using("btree", table.accountId.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'running'::text]))`),
	index("idx_task_runs_agent").using("btree", table.agentId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(agent_id IS NOT NULL)`),
	index("idx_task_runs_orch").using("btree", table.orchestratedTaskId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(orchestrated_task_id IS NOT NULL)`),
	index("idx_task_runs_pod_status").using("btree", table.podId.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(pod_id IS NOT NULL)`),
	index("idx_task_runs_task").using("btree", table.taskId.asc().nullsLast(), table.createdAt.desc().nullsFirst()).where(sql`(task_id IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "task_runs_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "task_runs_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orchestratedTaskId],
			foreignColumns: [orchestratedTasks.id],
			name: "task_runs_orchestrated_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentRunId],
			foreignColumns: [table.id],
			name: "task_runs_parent_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "task_runs_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "task_runs_task_id_fkey"
		}).onDelete("cascade"),
	check("task_runs_attempt_check", sql`attempt >= 1`),
	check("task_runs_failure_reason_check", sql`(failure_reason IS NULL) OR (failure_reason = ANY (ARRAY['agent_error'::text, 'timeout'::text, 'runtime_offline'::text, 'manual'::text, 'circuit_open'::text, 'invalid_input'::text, 'tool_error'::text, 'other'::text]))`),
	check("task_runs_max_attempts_check", sql`max_attempts >= 1`),
	check("task_runs_status_check", sql`status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])`),
	check("task_runs_trigger_check", sql`trigger = ANY (ARRAY['manual'::text, 'autopilot'::text, 'mention'::text, 'heartbeat'::text, 'dag'::text, 'schedule'::text])`),
]);

export const heartbeatConfigs = pgTable("heartbeat_configs", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	podId: uuid("pod_id"),
	boardId: uuid("board_id"),
	name: text().notNull(),
	schedule: text().default('0 */4 * * *').notNull(),
	prompt: text().default('Review pending tasks and take appropriate actions.').notNull(),
	isActive: boolean("is_active").default(false),
	dryRun: boolean("dry_run").default(false),
	maxTasksPerRun: integer("max_tasks_per_run").default(5),
	circuitBreakerThreshold: integer("circuit_breaker_threshold").default(3),
	consecutiveFailures: integer("consecutive_failures").default(0),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	lastRunStatus: text("last_run_status"),
	lastRunSummary: text("last_run_summary"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	pilotEnabled: boolean("pilot_enabled").default(false),
	executionMode: text("execution_mode").default('create_task').notNull(),
	concurrencyPolicy: text("concurrency_policy").default('queue').notNull(),
}, (table) => [
	index("idx_heartbeat_configs_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_heartbeat_configs_active").using("btree", table.isActive.asc().nullsLast()).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "heartbeat_configs_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.boardId],
			foreignColumns: [boardInstances.id],
			name: "heartbeat_configs_board_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "heartbeat_configs_pod_id_fkey"
		}).onDelete("cascade"),
	check("heartbeat_configs_concurrency_policy_check", sql`concurrency_policy = ANY (ARRAY['skip'::text, 'queue'::text, 'replace'::text])`),
	check("heartbeat_configs_execution_mode_check", sql`execution_mode = ANY (ARRAY['create_task'::text, 'run_only'::text])`),
	check("heartbeat_configs_last_run_status_check", sql`last_run_status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text, 'running'::text])`),
]);

export const categorySkills = pgTable("category_skills", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	categoryId: uuid("category_id").notNull(),
	skillId: uuid("skill_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_category_skills_category").using("btree", table.categoryId.asc().nullsLast()),
	index("idx_category_skills_skill").using("btree", table.skillId.asc().nullsLast()),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "category_skills_category_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "category_skills_skill_id_fkey"
		}).onDelete("cascade"),
	unique("category_skills_unique").on(table.categoryId, table.skillId),
]);

export const taskDependencies = pgTable("task_dependencies", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	sourceTaskId: uuid("source_task_id").notNull(),
	targetTaskId: uuid("target_task_id").notNull(),
	dependencyType: text("dependency_type").default('dag').notNull(),
	routeId: uuid("route_id"),
	dagId: uuid("dag_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_task_deps_dag").using("btree", table.dagId.asc().nullsLast()),
	index("idx_task_deps_source").using("btree", table.sourceTaskId.asc().nullsLast()),
	index("idx_task_deps_target").using("btree", table.targetTaskId.asc().nullsLast()),
	foreignKey({
			columns: [table.dagId],
			foreignColumns: [taskDags.id],
			name: "task_dependencies_dag_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.routeId],
			foreignColumns: [boardRoutes.id],
			name: "task_dependencies_route_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.sourceTaskId],
			foreignColumns: [tasks.id],
			name: "task_dependencies_source_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetTaskId],
			foreignColumns: [tasks.id],
			name: "task_dependencies_target_task_id_fkey"
		}).onDelete("cascade"),
	check("task_dependencies_dependency_type_check", sql`dependency_type = ANY (ARRAY['route'::text, 'dag'::text, 'manual'::text])`),
]);

export const autopilotTriggers = pgTable("autopilot_triggers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	autopilotId: uuid("autopilot_id").notNull(),
	kind: text().notNull(),
	cronExpression: text("cron_expression"),
	webhookToken: text("webhook_token"),
	nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: 'string' }),
	lastFiredAt: timestamp("last_fired_at", { withTimezone: true, mode: 'string' }),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("autopilot_triggers_webhook_token").using("btree", table.webhookToken.asc().nullsLast()).where(sql`(webhook_token IS NOT NULL)`),
	index("idx_autopilot_triggers_autopilot").using("btree", table.autopilotId.asc().nullsLast()),
	index("idx_autopilot_triggers_due").using("btree", table.nextRunAt.asc().nullsFirst()).where(sql`((enabled = true) AND (kind = 'schedule'::text))`),
	foreignKey({
			columns: [table.autopilotId],
			foreignColumns: [heartbeatConfigs.id],
			name: "autopilot_triggers_autopilot_id_fkey"
		}).onDelete("cascade"),
	check("autopilot_triggers_kind_check", sql`kind = ANY (ARRAY['schedule'::text, 'webhook'::text, 'manual'::text, 'mention'::text])`),
]);

export const skills = pgTable("skills", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	name: text().notNull(),
	description: text(),
	instructions: text().default("").notNull(),
	isActive: boolean("is_active").default(true),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	fileAttachments: jsonb("file_attachments").default([]),
	skillType: varchar("skill_type", { length: 30 }).default('general'),
	sourceType: text("source_type").default('custom').notNull(),
	sourceUri: text("source_uri"),
	sourceSyncId: uuid("source_sync_id"),
	sourceVersion: text("source_version"),
	locallyAvailable: boolean("locally_available").default(false).notNull(),
	searchIndex: tsvector("search_index").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE(description, ''::text)))`),
}, (table) => [
	index("idx_skills_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_skills_account_type").using("btree", table.accountId.asc().nullsLast(), table.skillType.asc().nullsLast()),
	index("idx_skills_active").using("btree", table.accountId.asc().nullsLast(), table.isActive.asc().nullsLast()).where(sql`(is_active = true)`),
	index("idx_skills_name").using("btree", table.accountId.asc().nullsLast(), table.name.asc().nullsLast()),
	index("idx_skills_search").using("gin", table.searchIndex.asc().nullsLast().op("tsvector_ops")),
	index("idx_skills_source_sync").using("btree", table.sourceSyncId.asc().nullsLast()).where(sql`(source_sync_id IS NOT NULL)`),
	index("idx_skills_source_type").using("btree", table.accountId.asc().nullsLast(), table.sourceType.asc().nullsLast()),
	index("idx_skills_type").using("btree", table.skillType.asc().nullsLast()),
	uniqueIndex("skills_source_uri_unique").using("btree", table.accountId.asc().nullsLast(), table.sourceType.asc().nullsLast(), table.sourceUri.asc().nullsLast()).where(sql`(source_uri IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "skills_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "skills_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.sourceSyncId],
			foreignColumns: [syncs.id],
			name: "skills_source_sync_id_fkey"
		}).onDelete("set null"),
	unique("skills_unique_name_per_account").on(table.accountId, table.name),
	check("skills_instructions_size", sql`char_length(instructions) <= 51200`),
	check("skills_name_not_empty", sql`char_length(TRIM(BOTH FROM name)) > 0`),
	check("skills_skill_type_check", sql`(skill_type)::text = ANY ((ARRAY['general'::character varying, 'integration'::character varying, 'board'::character varying, 'system'::character varying])::text[])`),
	check("skills_source_type_check", sql`source_type = ANY (ARRAY['custom'::text, 'disk-scan'::text, 'git-repo'::text, 'marketplace'::text])`),
]);

export const providerAgents = pgTable("provider_agents", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	providerType: text("provider_type").default('openclaw').notNull(),
	remoteSkillPath: text("remote_skill_path"),
	instructionsHash: text("instructions_hash"),
	compiledInstructions: text("compiled_instructions"),
	skillIdsSnapshot: jsonb("skill_ids_snapshot").default([]),
	knowledgeDocId: uuid("knowledge_doc_id"),
	syncStatus: text("sync_status").default('pending').notNull(),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	lastSyncError: text("last_sync_error"),
	retryCount: integer("retry_count").default(0).notNull(),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	agentId: uuid("agent_id"),
}, (table) => [
	index("idx_provider_agents_account").using("btree", table.accountId.asc().nullsLast()),
	index("idx_provider_agents_agent_id").using("btree", table.agentId.asc().nullsLast()).where(sql`(agent_id IS NOT NULL)`),
	index("idx_provider_agents_category").using("btree", table.accountId.asc().nullsLast(), table.categoryId.asc().nullsLast()),
	index("idx_provider_agents_retry").using("btree", table.nextRetryAt.asc().nullsLast()).where(sql`((sync_status = 'error'::text) AND (next_retry_at IS NOT NULL))`),
	index("idx_provider_agents_sync_status").using("btree", table.syncStatus.asc().nullsLast()).where(sql`(sync_status = ANY (ARRAY['pending'::text, 'stale'::text, 'error'::text]))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "provider_agents_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "provider_agents_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "provider_agents_category_id_fkey"
		}).onDelete("cascade"),
	unique("provider_agents_unique_account_category").on(table.accountId, table.categoryId),
	check("provider_agents_sync_status_check", sql`sync_status = ANY (ARRAY['pending'::text, 'syncing'::text, 'synced'::text, 'error'::text, 'stale'::text])`),
]);

export const boardSteps = pgTable("board_steps", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	boardInstanceId: uuid("board_instance_id").notNull(),
	stepKey: text("step_key").notNull(),
	name: text().notNull(),
	stepType: text("step_type").notNull(),
	position: integer().notNull(),
	color: text(),
	aiEnabled: boolean("ai_enabled").default(false),
	aiFirst: boolean("ai_first").default(false),
	systemPrompt: text("system_prompt"),
	modelOverride: text("model_override"),
	temperature: doublePrecision(),
	maxRetries: integer("max_retries").default(2),
	timeoutSeconds: integer("timeout_seconds").default(120),
	skillIds: uuid("skill_ids").array().default(sql`'{}'`),
	knowledgeBaseIds: uuid("knowledge_base_ids").array().default(sql`'{}'`),
	requiredToolIds: text("required_tool_ids").array().default(sql`'{}'`),
	inputFields: jsonb("input_fields").default([]),
	outputFields: jsonb("output_fields").default([]),
	triggerType: text("trigger_type").default('manual'),
	triggerConfig: jsonb("trigger_config").default({}),
	onCompleteStepKey: text("on_complete_step_key"),
	onErrorStepKey: text("on_error_step_key"),
	routingRules: jsonb("routing_rules").default([]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	linkedCategoryId: uuid("linked_category_id"),
	inputSchema: jsonb("input_schema").default([]).notNull(),
	outputSchema: jsonb("output_schema").default([]).notNull(),
	onSuccessStepId: uuid("on_success_step_id"),
	onErrorStepId: uuid("on_error_step_id"),
	webhookUrl: text("webhook_url"),
	webhookAuthHeader: text("webhook_auth_header"),
	scheduleCron: text("schedule_cron"),
	backboneConnectionId: uuid("backbone_connection_id"),
	defaultAgentId: uuid("default_agent_id"),
}, (table) => [
	index("idx_board_steps_board").using("btree", table.boardInstanceId.asc().nullsLast()),
	index("idx_board_steps_category").using("btree", table.linkedCategoryId.asc().nullsLast()).where(sql`(linked_category_id IS NOT NULL)`),
	index("idx_board_steps_default_agent").using("btree", table.defaultAgentId.asc().nullsLast()).where(sql`(default_agent_id IS NOT NULL)`),
	index("idx_board_steps_error").using("btree", table.onErrorStepId.asc().nullsLast()).where(sql`(on_error_step_id IS NOT NULL)`),
	index("idx_board_steps_success").using("btree", table.onSuccessStepId.asc().nullsLast()).where(sql`(on_success_step_id IS NOT NULL)`),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "board_steps_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.boardInstanceId],
			foreignColumns: [boardInstances.id],
			name: "board_steps_board_instance_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.defaultAgentId],
			foreignColumns: [agents.id],
			name: "board_steps_default_agent_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.linkedCategoryId],
			foreignColumns: [categories.id],
			name: "board_steps_linked_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.onErrorStepId],
			foreignColumns: [table.id],
			name: "board_steps_on_error_step_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.onSuccessStepId],
			foreignColumns: [table.id],
			name: "board_steps_on_success_step_id_fkey"
		}).onDelete("set null"),
	unique("board_steps_board_instance_id_step_key_key").on(table.boardInstanceId, table.stepKey),
	check("board_steps_step_type_check", sql`step_type = ANY (ARRAY['input'::text, 'ai_process'::text, 'human_review'::text, 'action'::text, 'done'::text])`),
	check("board_steps_trigger_type_check", sql`trigger_type = ANY (ARRAY['on_entry'::text, 'auto'::text, 'manual'::text, 'schedule'::text, 'webhook'::text])`),
]);

export const boardTemplates = pgTable("board_templates", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	icon: text().default('layout-grid'),
	color: text().default('#6366f1'),
	tags: text().array().default(sql`'{}'`),
	manifest: jsonb().notNull(),
	manifestVersion: text("manifest_version").default('1.0').notNull(),
	version: text().default('1.0.0').notNull(),
	changelog: text(),
	isPublished: boolean("is_published").default(false),
	isSystem: boolean("is_system").default(false),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	authorName: text("author_name"),
	authorEmail: text("author_email"),
	installCount: integer("install_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "board_templates_account_id_fkey"
		}).onDelete("cascade"),
	unique("board_templates_account_id_slug_key").on(table.accountId, table.slug),
]);

export const agentApprovalRequests = pgTable("agent_approval_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orchestratedTaskId: uuid("orchestrated_task_id").notNull(),
	requestedByAgentId: uuid("requested_by_agent_id"),
	reason: text().notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
	responseNote: text("response_note"),
}, (table) => [
	index("idx_agent_approval_requests_task_status").using("btree", table.orchestratedTaskId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.orchestratedTaskId],
			foreignColumns: [orchestratedTasks.id],
			name: "agent_approval_requests_orchestrated_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.requestedByAgentId],
			foreignColumns: [agents.id],
			name: "agent_approval_requests_requested_by_agent_id_fkey"
		}).onDelete("set null"),
	check("agent_approval_requests_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const boardInstances = pgTable("board_instances", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	templateId: uuid("template_id"),
	name: text().notNull(),
	description: text(),
	icon: text().default('layout-grid'),
	color: text().default('#6366f1'),
	tags: text().array().default(sql`'{}'`),
	isFavorite: boolean("is_favorite").default(false),
	displayOrder: integer("display_order").default(0),
	settingsOverride: jsonb("settings_override").default({}),
	installedManifest: jsonb("installed_manifest"),
	installedVersion: text("installed_version"),
	latestAvailableVersion: text("latest_available_version"),
	isArchived: boolean("is_archived").default(false),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	defaultCategoryId: uuid("default_category_id"),
	orchestratorCategoryId: uuid("orchestrator_category_id"),
	defaultBackboneConnectionId: uuid("default_backbone_connection_id"),
	podId: uuid("pod_id"),
	backboneConnectionId: uuid("backbone_connection_id"),
}, (table) => [
	index("idx_board_instances_account").using("btree", table.accountId.asc().nullsLast()).where(sql`(NOT is_archived)`),
	index("idx_board_instances_backbone").using("btree", table.backboneConnectionId.asc().nullsLast()),
	index("idx_board_instances_default_category").using("btree", table.defaultCategoryId.asc().nullsLast()).where(sql`(default_category_id IS NOT NULL)`),
	index("idx_board_instances_favorite").using("btree", table.accountId.asc().nullsLast(), table.isFavorite.asc().nullsLast()).where(sql`(NOT is_archived)`),
	index("idx_board_instances_pod").using("btree", table.podId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "board_instances_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "board_instances_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.defaultBackboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "board_instances_default_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.defaultCategoryId],
			foreignColumns: [categories.id],
			name: "board_instances_default_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orchestratorCategoryId],
			foreignColumns: [categories.id],
			name: "board_instances_orchestrator_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "board_instances_pod_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [boardTemplates.id],
			name: "board_instances_template_id_fkey"
		}).onDelete("set null"),
]);

export const agentActivity = pgTable("agent_activity", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	agentId: uuid("agent_id").notNull(),
	activityType: varchar("activity_type", { length: 30 }).notNull(),
	taskId: uuid("task_id"),
	dagId: uuid("dag_id"),
	conversationId: uuid("conversation_id"),
	boardId: uuid("board_id"),
	summary: text().notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_agent_activity_account").using("btree", table.accountId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_agent_activity_agent").using("btree", table.agentId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "agent_activity_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "agent_activity_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.boardId],
			foreignColumns: [boardInstances.id],
			name: "agent_activity_board_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "agent_activity_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.dagId],
			foreignColumns: [taskDags.id],
			name: "agent_activity_dag_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [tasks.id],
			name: "agent_activity_task_id_fkey"
		}).onDelete("set null"),
]);

export const tasks = pgTable("tasks", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	categoryId: uuid("category_id"),
	sourceId: uuid("source_id"),
	externalId: text("external_id"),
	title: text().notNull(),
	status: text().default('To-Do').notNull(),
	priority: text().default('Medium'),
	completed: boolean().default(false),
	notes: text(),
	metadata: jsonb().default({}),
	externalUrl: text("external_url"),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	boardInstanceId: uuid("board_instance_id"),
	currentStepId: uuid("current_step_id"),
	cardData: jsonb("card_data").default({}),
	stepHistory: jsonb("step_history").default([]),
	overrideCategoryId: uuid("override_category_id"),
	result: jsonb(),
	dagId: uuid("dag_id"),
	backboneConnectionId: uuid("backbone_connection_id"),
	assigneeType: varchar("assignee_type", { length: 10 }).default('none'),
	assigneeId: uuid("assignee_id"),
	creatorType: text("creator_type").default('user').notNull(),
	creatorId: uuid("creator_id"),
	inputContext: jsonb("input_context").default({}).notNull(),
	searchIndex: tsvector("search_index").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(notes, ''::text)))`),
}, (table) => [
	index("idx_tasks_account_id").using("btree", table.accountId.asc().nullsLast()),
	index("idx_tasks_agent_assignee").using("btree", table.assigneeId.asc().nullsLast()).where(sql`((assignee_type)::text = 'agent'::text)`),
	index("idx_tasks_board").using("btree", table.boardInstanceId.asc().nullsLast()).where(sql`(board_instance_id IS NOT NULL)`),
	index("idx_tasks_category_id").using("btree", table.categoryId.asc().nullsLast()),
	index("idx_tasks_completed").using("btree", table.completed.asc().nullsLast()),
	index("idx_tasks_creator_agent").using("btree", table.creatorId.asc().nullsLast()).where(sql`(creator_type = 'agent'::text)`),
	index("idx_tasks_creator_user").using("btree", table.creatorId.asc().nullsLast()).where(sql`(creator_type = 'user'::text)`),
	index("idx_tasks_external_id").using("btree", table.sourceId.asc().nullsLast(), table.externalId.asc().nullsLast()),
	index("idx_tasks_human_assignee").using("btree", table.assigneeId.asc().nullsLast()).where(sql`((assignee_type)::text = 'human'::text)`),
	index("idx_tasks_mention_chain").using("btree", sql`((input_context ->> 'source_task_id'::text))`).where(sql`((input_context ->> 'trigger'::text) = 'mention'::text)`),
	index("idx_tasks_override_category").using("btree", table.overrideCategoryId.asc().nullsLast()).where(sql`(override_category_id IS NOT NULL)`),
	index("idx_tasks_search").using("gin", table.searchIndex.asc().nullsLast().op("tsvector_ops")),
	index("idx_tasks_source_id").using("btree", table.sourceId.asc().nullsLast()),
	index("idx_tasks_status").using("btree", table.status.asc().nullsLast()),
	index("idx_tasks_step").using("btree", table.currentStepId.asc().nullsLast()).where(sql`(current_step_id IS NOT NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "tasks_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.assigneeId],
			foreignColumns: [agents.id],
			name: "tasks_assignee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.backboneConnectionId],
			foreignColumns: [backboneConnections.id],
			name: "tasks_backbone_connection_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.boardInstanceId],
			foreignColumns: [boardInstances.id],
			name: "tasks_board_instance_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "tasks_category_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.currentStepId],
			foreignColumns: [boardSteps.id],
			name: "tasks_current_step_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.dagId],
			foreignColumns: [taskDags.id],
			name: "tasks_dag_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.overrideCategoryId],
			foreignColumns: [categories.id],
			name: "tasks_override_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sources.id],
			name: "tasks_source_id_fkey"
		}).onDelete("set null"),
	unique("tasks_source_id_external_id_key").on(table.sourceId, table.externalId),
	check("tasks_assignee_type_check", sql`(assignee_type)::text = ANY ((ARRAY['none'::character varying, 'agent'::character varying, 'human'::character varying])::text[])`),
	check("tasks_creator_type_check", sql`creator_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text])`),
	check("tasks_priority_check", sql`priority = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text, 'Urgent'::text])`),
]);

export const orchestratedTasks = pgTable("orchestrated_tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	podId: uuid("pod_id"),
	parentOrchestratedTaskId: uuid("parent_orchestrated_task_id"),
	goal: text().notNull(),
	inputContext: jsonb("input_context").default({}),
	status: text().default('pending_approval').notNull(),
	autonomyLevel: integer("autonomy_level").default(1).notNull(),
	resultSummary: text("result_summary"),
	structuredOutput: jsonb("structured_output"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_orchestrated_tasks_account_status").using("btree", table.accountId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("idx_orchestrated_tasks_parent_id").using("btree", table.parentOrchestratedTaskId.asc().nullsLast()),
	index("idx_orchestrated_tasks_pod_id").using("btree", table.podId.asc().nullsLast()),
	index("idx_orchestrated_tasks_stale").using("btree", table.status.asc().nullsLast(), table.updatedAt.asc().nullsLast()).where(sql`(status = 'running'::text)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "orchestrated_tasks_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentOrchestratedTaskId],
			foreignColumns: [table.id],
			name: "orchestrated_tasks_parent_orchestrated_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.podId],
			foreignColumns: [pods.id],
			name: "orchestrated_tasks_pod_id_fkey"
		}).onDelete("set null"),
	check("orchestrated_tasks_autonomy_level_check", sql`(autonomy_level >= 1) AND (autonomy_level <= 4)`),
	check("orchestrated_tasks_status_check", sql`status = ANY (ARRAY['pending_approval'::text, 'pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])`),
]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webhookId: uuid("webhook_id").notNull(),
	event: text().notNull(),
	payload: jsonb().notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	responseCode: integer("response_code"),
	responseBody: text("response_body"),
	attempts: integer().default(0),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_webhook_deliveries_retry").using("btree", table.nextRetryAt.asc().nullsLast()).where(sql`(((status)::text = 'pending'::text) AND (next_retry_at IS NOT NULL))`),
	index("idx_webhook_deliveries_status").using("btree", table.status.asc().nullsLast()).where(sql`((status)::text = 'pending'::text)`),
	index("idx_webhook_deliveries_webhook").using("btree", table.webhookId.asc().nullsLast()),
	foreignKey({
			columns: [table.webhookId],
			foreignColumns: [webhooks.id],
			name: "webhook_deliveries_webhook_id_fkey"
		}).onDelete("cascade"),
	check("webhook_deliveries_status_check", sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying])::text[])`),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	accountId: uuid("account_id"),
	planId: uuid("plan_id"),
	status: text(),
	provider: text().default('stripe'),
	providerSubscriptionId: text("provider_subscription_id"),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "subscriptions_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [plans.id],
			name: "subscriptions_plan_id_fkey"
		}),
	unique("subscriptions_account_id_key").on(table.accountId),
	check("subscriptions_status_check", sql`status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text])`),
]);

export const orchestratedTaskDeps = pgTable("orchestrated_task_deps", {
	upstreamTaskId: uuid("upstream_task_id").notNull(),
	downstreamTaskId: uuid("downstream_task_id").notNull(),
}, (table) => [
	index("idx_orchestrated_task_deps_downstream").using("btree", table.downstreamTaskId.asc().nullsLast()),
	foreignKey({
			columns: [table.downstreamTaskId],
			foreignColumns: [orchestratedTasks.id],
			name: "orchestrated_task_deps_downstream_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.upstreamTaskId],
			foreignColumns: [orchestratedTasks.id],
			name: "orchestrated_task_deps_upstream_task_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.upstreamTaskId, table.downstreamTaskId], name: "orchestrated_task_deps_pkey"}),
	check("orchestrated_task_deps_check", sql`upstream_task_id <> downstream_task_id`),
]);

export const agentSkills = pgTable("agent_skills", {
	agentId: uuid("agent_id").notNull(),
	skillId: uuid("skill_id").notNull(),
	isActive: boolean("is_active").default(true),
}, (table) => [
	index("idx_agent_skills_agent_id").using("btree", table.agentId.asc().nullsLast()),
	index("idx_agent_skills_skill_id").using("btree", table.skillId.asc().nullsLast()),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "agent_skills_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skills.id],
			name: "agent_skills_skill_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.agentId, table.skillId], name: "agent_skills_pkey"}),
]);

export const semaphoreLeases = pgTable("semaphore_leases", {
	accountId: uuid("account_id").notNull(),
	resourceKey: text("resource_key").notNull(),
	holderId: uuid("holder_id").notNull(),
	acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_semaphore_account_resource").using("btree", table.accountId.asc().nullsLast(), table.resourceKey.asc().nullsLast()),
	index("idx_semaphore_expires_at").using("btree", table.expiresAt.asc().nullsLast()),
	primaryKey({ columns: [table.accountId, table.resourceKey, table.holderId], name: "semaphore_leases_pkey"}),
]);
