import { relations } from "drizzle-orm/relations";
import { accounts, syncs, syncRuns, integrationDefinitions, skills, backboneConnections, apiKeys, pods, agents, webhooks, messages, conversations, boardRoutes, boardInstances, boardSteps, taskDags, integrationTools, tokenUsage, tasks, executionLog, heartbeatConfigs, sources, syncJobs, aiConversations, aiMessages, accountUsers, users, projects, projectUsers, tokenUsageDaily, invitations, providerAgents, agentSyncLogs, cardExecutions, integrationConnections, categories, dagApprovals, boardIntegrationRefs, aiProviderConfigs, memoryConnections, pilotConfigs, knowledgeDocs, agentMemories, taskRuns, orchestratedTasks, categorySkills, taskDependencies, autopilotTriggers, boardTemplates, agentApprovalRequests, agentActivity, webhookDeliveries, subscriptions, plans, orchestratedTaskDeps, agentSkills } from "./schema";

export const syncsRelations = relations(syncs, ({one, many}) => ({
	account: one(accounts, {
		fields: [syncs.accountId],
		references: [accounts.id]
	}),
	syncRuns: many(syncRuns),
	skills: many(skills),
}));

export const accountsRelations = relations(accounts, ({one, many}) => ({
	syncs: many(syncs),
	integrationDefinitions: many(integrationDefinitions),
	backboneConnections: many(backboneConnections),
	apiKeys: many(apiKeys),
	pods: many(pods),
	webhooks: many(webhooks),
	agents: many(agents),
	boardRoutes: many(boardRoutes),
	taskDags: many(taskDags),
	integrationTools: many(integrationTools),
	tokenUsages: many(tokenUsage),
	executionLogs: many(executionLog),
	accountUsers: many(accountUsers),
	tokenUsageDailies: many(tokenUsageDaily),
	invitations: many(invitations),
	user: one(users, {
		fields: [accounts.ownerUserId],
		references: [users.id]
	}),
	projects: many(projects),
	integrationConnections: many(integrationConnections),
	sources: many(sources),
	aiProviderConfigs: many(aiProviderConfigs),
	categories: many(categories),
	memoryConnections: many(memoryConnections),
	pilotConfigs: many(pilotConfigs),
	conversations: many(conversations),
	knowledgeDocs: many(knowledgeDocs),
	agentMemories: many(agentMemories),
	taskRuns: many(taskRuns),
	heartbeatConfigs: many(heartbeatConfigs),
	skills: many(skills),
	providerAgents: many(providerAgents),
	boardTemplates: many(boardTemplates),
	boardInstances: many(boardInstances),
	agentActivities: many(agentActivity),
	tasks: many(tasks),
	orchestratedTasks: many(orchestratedTasks),
	subscriptions: many(subscriptions),
}));

export const syncRunsRelations = relations(syncRuns, ({one}) => ({
	sync: one(syncs, {
		fields: [syncRuns.syncId],
		references: [syncs.id]
	}),
}));

export const integrationDefinitionsRelations = relations(integrationDefinitions, ({one, many}) => ({
	account: one(accounts, {
		fields: [integrationDefinitions.accountId],
		references: [accounts.id]
	}),
	skill: one(skills, {
		fields: [integrationDefinitions.skillId],
		references: [skills.id]
	}),
	integrationTools: many(integrationTools),
	integrationConnections: many(integrationConnections),
}));

export const skillsRelations = relations(skills, ({one, many}) => ({
	integrationDefinitions: many(integrationDefinitions),
	categorySkills: many(categorySkills),
	account: one(accounts, {
		fields: [skills.accountId],
		references: [accounts.id]
	}),
	sync: one(syncs, {
		fields: [skills.sourceSyncId],
		references: [syncs.id]
	}),
	agentSkills: many(agentSkills),
}));

export const backboneConnectionsRelations = relations(backboneConnections, ({one, many}) => ({
	account: one(accounts, {
		fields: [backboneConnections.accountId],
		references: [accounts.id]
	}),
	pods: many(pods),
	messages: many(messages),
	agents: many(agents),
	aiProviderConfigs: many(aiProviderConfigs),
	categories: many(categories),
	pilotConfigs: many(pilotConfigs),
	conversations: many(conversations),
	boardSteps: many(boardSteps),
	boardInstances_backboneConnectionId: many(boardInstances, {
		relationName: "boardInstances_backboneConnectionId_backboneConnections_id"
	}),
	boardInstances_defaultBackboneConnectionId: many(boardInstances, {
		relationName: "boardInstances_defaultBackboneConnectionId_backboneConnections_id"
	}),
	tasks: many(tasks),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	account: one(accounts, {
		fields: [apiKeys.accountId],
		references: [accounts.id]
	}),
}));

export const podsRelations = relations(pods, ({one, many}) => ({
	account: one(accounts, {
		fields: [pods.accountId],
		references: [accounts.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [pods.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	agent: one(agents, {
		fields: [pods.pilotAgentId],
		references: [agents.id]
	}),
	boardRoutes: many(boardRoutes),
	taskDags: many(taskDags),
	tokenUsages: many(tokenUsage),
	executionLogs: many(executionLog),
	tokenUsageDailies: many(tokenUsageDaily),
	pilotConfigs: many(pilotConfigs),
	conversations: many(conversations),
	taskRuns: many(taskRuns),
	heartbeatConfigs: many(heartbeatConfigs),
	boardInstances: many(boardInstances),
	orchestratedTasks: many(orchestratedTasks),
}));

export const agentsRelations = relations(agents, ({one, many}) => ({
	pods: many(pods),
	account: one(accounts, {
		fields: [agents.accountId],
		references: [accounts.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [agents.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	tokenUsages: many(tokenUsage),
	tokenUsageDailies: many(tokenUsageDaily),
	conversations: many(conversations),
	knowledgeDocs: many(knowledgeDocs),
	taskRuns: many(taskRuns),
	providerAgents: many(providerAgents),
	boardSteps: many(boardSteps),
	agentApprovalRequests: many(agentApprovalRequests),
	agentActivities: many(agentActivity),
	tasks: many(tasks),
	agentSkills: many(agentSkills),
}));

export const webhooksRelations = relations(webhooks, ({one, many}) => ({
	account: one(accounts, {
		fields: [webhooks.accountId],
		references: [accounts.id]
	}),
	webhookDeliveries: many(webhookDeliveries),
}));

export const messagesRelations = relations(messages, ({one, many}) => ({
	backboneConnection: one(backboneConnections, {
		fields: [messages.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
	tokenUsages: many(tokenUsage),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	messages: many(messages),
	taskDags: many(taskDags),
	tokenUsages: many(tokenUsage),
	executionLogs: many(executionLog),
	integrationConnections: many(integrationConnections),
	account: one(accounts, {
		fields: [conversations.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [conversations.agentId],
		references: [agents.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [conversations.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [conversations.boardId],
		references: [boardInstances.id]
	}),
	pod: one(pods, {
		fields: [conversations.podId],
		references: [pods.id]
	}),
	task: one(tasks, {
		fields: [conversations.taskId],
		references: [tasks.id]
	}),
	agentMemories: many(agentMemories),
	agentActivities: many(agentActivity),
}));

export const boardRoutesRelations = relations(boardRoutes, ({one, many}) => ({
	account: one(accounts, {
		fields: [boardRoutes.accountId],
		references: [accounts.id]
	}),
	pod: one(pods, {
		fields: [boardRoutes.podId],
		references: [pods.id]
	}),
	boardInstance_sourceBoardId: one(boardInstances, {
		fields: [boardRoutes.sourceBoardId],
		references: [boardInstances.id],
		relationName: "boardRoutes_sourceBoardId_boardInstances_id"
	}),
	boardStep_sourceStepId: one(boardSteps, {
		fields: [boardRoutes.sourceStepId],
		references: [boardSteps.id],
		relationName: "boardRoutes_sourceStepId_boardSteps_id"
	}),
	boardInstance_targetBoardId: one(boardInstances, {
		fields: [boardRoutes.targetBoardId],
		references: [boardInstances.id],
		relationName: "boardRoutes_targetBoardId_boardInstances_id"
	}),
	boardStep_targetStepId: one(boardSteps, {
		fields: [boardRoutes.targetStepId],
		references: [boardSteps.id],
		relationName: "boardRoutes_targetStepId_boardSteps_id"
	}),
	executionLogs: many(executionLog),
	taskDependencies: many(taskDependencies),
}));

export const boardInstancesRelations = relations(boardInstances, ({one, many}) => ({
	boardRoutes_sourceBoardId: many(boardRoutes, {
		relationName: "boardRoutes_sourceBoardId_boardInstances_id"
	}),
	boardRoutes_targetBoardId: many(boardRoutes, {
		relationName: "boardRoutes_targetBoardId_boardInstances_id"
	}),
	executionLogs: many(executionLog),
	boardIntegrationRefs: many(boardIntegrationRefs),
	conversations: many(conversations),
	agentMemories: many(agentMemories),
	heartbeatConfigs: many(heartbeatConfigs),
	boardSteps: many(boardSteps),
	account: one(accounts, {
		fields: [boardInstances.accountId],
		references: [accounts.id]
	}),
	backboneConnection_backboneConnectionId: one(backboneConnections, {
		fields: [boardInstances.backboneConnectionId],
		references: [backboneConnections.id],
		relationName: "boardInstances_backboneConnectionId_backboneConnections_id"
	}),
	backboneConnection_defaultBackboneConnectionId: one(backboneConnections, {
		fields: [boardInstances.defaultBackboneConnectionId],
		references: [backboneConnections.id],
		relationName: "boardInstances_defaultBackboneConnectionId_backboneConnections_id"
	}),
	category_defaultCategoryId: one(categories, {
		fields: [boardInstances.defaultCategoryId],
		references: [categories.id],
		relationName: "boardInstances_defaultCategoryId_categories_id"
	}),
	category_orchestratorCategoryId: one(categories, {
		fields: [boardInstances.orchestratorCategoryId],
		references: [categories.id],
		relationName: "boardInstances_orchestratorCategoryId_categories_id"
	}),
	pod: one(pods, {
		fields: [boardInstances.podId],
		references: [pods.id]
	}),
	boardTemplate: one(boardTemplates, {
		fields: [boardInstances.templateId],
		references: [boardTemplates.id]
	}),
	agentActivities: many(agentActivity),
	tasks: many(tasks),
}));

export const boardStepsRelations = relations(boardSteps, ({one, many}) => ({
	boardRoutes_sourceStepId: many(boardRoutes, {
		relationName: "boardRoutes_sourceStepId_boardSteps_id"
	}),
	boardRoutes_targetStepId: many(boardRoutes, {
		relationName: "boardRoutes_targetStepId_boardSteps_id"
	}),
	cardExecutions: many(cardExecutions),
	backboneConnection: one(backboneConnections, {
		fields: [boardSteps.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [boardSteps.boardInstanceId],
		references: [boardInstances.id]
	}),
	agent: one(agents, {
		fields: [boardSteps.defaultAgentId],
		references: [agents.id]
	}),
	category: one(categories, {
		fields: [boardSteps.linkedCategoryId],
		references: [categories.id]
	}),
	boardStep_onErrorStepId: one(boardSteps, {
		fields: [boardSteps.onErrorStepId],
		references: [boardSteps.id],
		relationName: "boardSteps_onErrorStepId_boardSteps_id"
	}),
	boardSteps_onErrorStepId: many(boardSteps, {
		relationName: "boardSteps_onErrorStepId_boardSteps_id"
	}),
	boardStep_onSuccessStepId: one(boardSteps, {
		fields: [boardSteps.onSuccessStepId],
		references: [boardSteps.id],
		relationName: "boardSteps_onSuccessStepId_boardSteps_id"
	}),
	boardSteps_onSuccessStepId: many(boardSteps, {
		relationName: "boardSteps_onSuccessStepId_boardSteps_id"
	}),
	tasks: many(tasks),
}));

export const taskDagsRelations = relations(taskDags, ({one, many}) => ({
	account: one(accounts, {
		fields: [taskDags.accountId],
		references: [accounts.id]
	}),
	conversation: one(conversations, {
		fields: [taskDags.conversationId],
		references: [conversations.id]
	}),
	pod: one(pods, {
		fields: [taskDags.podId],
		references: [pods.id]
	}),
	executionLogs: many(executionLog),
	dagApprovals: many(dagApprovals),
	taskDependencies: many(taskDependencies),
	agentActivities: many(agentActivity),
	tasks: many(tasks),
}));

export const integrationToolsRelations = relations(integrationTools, ({one}) => ({
	account: one(accounts, {
		fields: [integrationTools.accountId],
		references: [accounts.id]
	}),
	integrationDefinition: one(integrationDefinitions, {
		fields: [integrationTools.definitionId],
		references: [integrationDefinitions.id]
	}),
}));

export const tokenUsageRelations = relations(tokenUsage, ({one}) => ({
	account: one(accounts, {
		fields: [tokenUsage.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [tokenUsage.agentId],
		references: [agents.id]
	}),
	conversation: one(conversations, {
		fields: [tokenUsage.conversationId],
		references: [conversations.id]
	}),
	message: one(messages, {
		fields: [tokenUsage.messageId],
		references: [messages.id]
	}),
	pod: one(pods, {
		fields: [tokenUsage.podId],
		references: [pods.id]
	}),
	task: one(tasks, {
		fields: [tokenUsage.taskId],
		references: [tasks.id]
	}),
}));

export const tasksRelations = relations(tasks, ({one, many}) => ({
	tokenUsages: many(tokenUsage),
	executionLogs: many(executionLog),
	cardExecutions: many(cardExecutions),
	conversations: many(conversations),
	agentMemories: many(agentMemories),
	taskRuns: many(taskRuns),
	taskDependencies_sourceTaskId: many(taskDependencies, {
		relationName: "taskDependencies_sourceTaskId_tasks_id"
	}),
	taskDependencies_targetTaskId: many(taskDependencies, {
		relationName: "taskDependencies_targetTaskId_tasks_id"
	}),
	agentActivities: many(agentActivity),
	account: one(accounts, {
		fields: [tasks.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [tasks.assigneeId],
		references: [agents.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [tasks.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [tasks.boardInstanceId],
		references: [boardInstances.id]
	}),
	category_categoryId: one(categories, {
		fields: [tasks.categoryId],
		references: [categories.id],
		relationName: "tasks_categoryId_categories_id"
	}),
	boardStep: one(boardSteps, {
		fields: [tasks.currentStepId],
		references: [boardSteps.id]
	}),
	taskDag: one(taskDags, {
		fields: [tasks.dagId],
		references: [taskDags.id]
	}),
	category_overrideCategoryId: one(categories, {
		fields: [tasks.overrideCategoryId],
		references: [categories.id],
		relationName: "tasks_overrideCategoryId_categories_id"
	}),
	source: one(sources, {
		fields: [tasks.sourceId],
		references: [sources.id]
	}),
}));

export const executionLogRelations = relations(executionLog, ({one}) => ({
	account: one(accounts, {
		fields: [executionLog.accountId],
		references: [accounts.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [executionLog.boardId],
		references: [boardInstances.id]
	}),
	conversation: one(conversations, {
		fields: [executionLog.conversationId],
		references: [conversations.id]
	}),
	taskDag: one(taskDags, {
		fields: [executionLog.dagId],
		references: [taskDags.id]
	}),
	heartbeatConfig: one(heartbeatConfigs, {
		fields: [executionLog.heartbeatConfigId],
		references: [heartbeatConfigs.id]
	}),
	pod: one(pods, {
		fields: [executionLog.podId],
		references: [pods.id]
	}),
	boardRoute: one(boardRoutes, {
		fields: [executionLog.routeId],
		references: [boardRoutes.id]
	}),
	task: one(tasks, {
		fields: [executionLog.taskId],
		references: [tasks.id]
	}),
}));

export const heartbeatConfigsRelations = relations(heartbeatConfigs, ({one, many}) => ({
	executionLogs: many(executionLog),
	account: one(accounts, {
		fields: [heartbeatConfigs.accountId],
		references: [accounts.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [heartbeatConfigs.boardId],
		references: [boardInstances.id]
	}),
	pod: one(pods, {
		fields: [heartbeatConfigs.podId],
		references: [pods.id]
	}),
	autopilotTriggers: many(autopilotTriggers),
}));

export const syncJobsRelations = relations(syncJobs, ({one}) => ({
	source: one(sources, {
		fields: [syncJobs.sourceId],
		references: [sources.id]
	}),
}));

export const sourcesRelations = relations(sources, ({one, many}) => ({
	syncJobs: many(syncJobs),
	account: one(accounts, {
		fields: [sources.accountId],
		references: [accounts.id]
	}),
	category: one(categories, {
		fields: [sources.categoryId],
		references: [categories.id]
	}),
	integrationConnection: one(integrationConnections, {
		fields: [sources.connectionId],
		references: [integrationConnections.id]
	}),
	tasks: many(tasks),
}));

export const aiMessagesRelations = relations(aiMessages, ({one}) => ({
	aiConversation: one(aiConversations, {
		fields: [aiMessages.conversationId],
		references: [aiConversations.id]
	}),
}));

export const aiConversationsRelations = relations(aiConversations, ({one, many}) => ({
	aiMessages: many(aiMessages),
}));

export const accountUsersRelations = relations(accountUsers, ({one}) => ({
	account: one(accounts, {
		fields: [accountUsers.accountId],
		references: [accounts.id]
	}),
	user: one(users, {
		fields: [accountUsers.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	accountUsers: many(accountUsers),
	projectUsers: many(projectUsers),
	accounts: many(accounts),
}));

export const projectUsersRelations = relations(projectUsers, ({one}) => ({
	project: one(projects, {
		fields: [projectUsers.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [projectUsers.userId],
		references: [users.id]
	}),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	projectUsers: many(projectUsers),
	account: one(accounts, {
		fields: [projects.accountId],
		references: [accounts.id]
	}),
}));

export const tokenUsageDailyRelations = relations(tokenUsageDaily, ({one}) => ({
	account: one(accounts, {
		fields: [tokenUsageDaily.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [tokenUsageDaily.agentId],
		references: [agents.id]
	}),
	pod: one(pods, {
		fields: [tokenUsageDaily.podId],
		references: [pods.id]
	}),
}));

export const invitationsRelations = relations(invitations, ({one}) => ({
	account: one(accounts, {
		fields: [invitations.accountId],
		references: [accounts.id]
	}),
}));

export const agentSyncLogsRelations = relations(agentSyncLogs, ({one}) => ({
	providerAgent: one(providerAgents, {
		fields: [agentSyncLogs.providerAgentId],
		references: [providerAgents.id]
	}),
}));

export const providerAgentsRelations = relations(providerAgents, ({one, many}) => ({
	agentSyncLogs: many(agentSyncLogs),
	account: one(accounts, {
		fields: [providerAgents.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [providerAgents.agentId],
		references: [agents.id]
	}),
	category: one(categories, {
		fields: [providerAgents.categoryId],
		references: [categories.id]
	}),
}));

export const cardExecutionsRelations = relations(cardExecutions, ({one}) => ({
	boardStep: one(boardSteps, {
		fields: [cardExecutions.boardStepId],
		references: [boardSteps.id]
	}),
	task: one(tasks, {
		fields: [cardExecutions.cardId],
		references: [tasks.id]
	}),
}));

export const integrationConnectionsRelations = relations(integrationConnections, ({one, many}) => ({
	account: one(accounts, {
		fields: [integrationConnections.accountId],
		references: [accounts.id]
	}),
	integrationDefinition: one(integrationDefinitions, {
		fields: [integrationConnections.definitionId],
		references: [integrationDefinitions.id]
	}),
	conversation: one(conversations, {
		fields: [integrationConnections.testConversationId],
		references: [conversations.id]
	}),
	sources: many(sources),
	boardIntegrationRefs: many(boardIntegrationRefs),
}));

export const categoriesRelations = relations(categories, ({one, many}) => ({
	sources: many(sources),
	account: one(accounts, {
		fields: [categories.accountId],
		references: [accounts.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [categories.preferredBackboneConnectionId],
		references: [backboneConnections.id]
	}),
	knowledgeDocs: many(knowledgeDocs),
	agentMemories: many(agentMemories),
	categorySkills: many(categorySkills),
	providerAgents: many(providerAgents),
	boardSteps: many(boardSteps),
	boardInstances_defaultCategoryId: many(boardInstances, {
		relationName: "boardInstances_defaultCategoryId_categories_id"
	}),
	boardInstances_orchestratorCategoryId: many(boardInstances, {
		relationName: "boardInstances_orchestratorCategoryId_categories_id"
	}),
	tasks_categoryId: many(tasks, {
		relationName: "tasks_categoryId_categories_id"
	}),
	tasks_overrideCategoryId: many(tasks, {
		relationName: "tasks_overrideCategoryId_categories_id"
	}),
}));

export const dagApprovalsRelations = relations(dagApprovals, ({one}) => ({
	taskDag: one(taskDags, {
		fields: [dagApprovals.dagId],
		references: [taskDags.id]
	}),
}));


export const boardIntegrationRefsRelations = relations(boardIntegrationRefs, ({one}) => ({
	boardInstance: one(boardInstances, {
		fields: [boardIntegrationRefs.boardId],
		references: [boardInstances.id]
	}),
	integrationConnection: one(integrationConnections, {
		fields: [boardIntegrationRefs.connectionId],
		references: [integrationConnections.id]
	}),
}));

export const aiProviderConfigsRelations = relations(aiProviderConfigs, ({one}) => ({
	account: one(accounts, {
		fields: [aiProviderConfigs.accountId],
		references: [accounts.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [aiProviderConfigs.migratedTo],
		references: [backboneConnections.id]
	}),
}));

export const memoryConnectionsRelations = relations(memoryConnections, ({one}) => ({
	account: one(accounts, {
		fields: [memoryConnections.accountId],
		references: [accounts.id]
	}),
}));

export const pilotConfigsRelations = relations(pilotConfigs, ({one}) => ({
	account: one(accounts, {
		fields: [pilotConfigs.accountId],
		references: [accounts.id]
	}),
	backboneConnection: one(backboneConnections, {
		fields: [pilotConfigs.backboneConnectionId],
		references: [backboneConnections.id]
	}),
	pod: one(pods, {
		fields: [pilotConfigs.podId],
		references: [pods.id]
	}),
}));

export const knowledgeDocsRelations = relations(knowledgeDocs, ({one}) => ({
	account: one(accounts, {
		fields: [knowledgeDocs.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [knowledgeDocs.agentId],
		references: [agents.id]
	}),
	category: one(categories, {
		fields: [knowledgeDocs.categoryId],
		references: [categories.id]
	}),
}));

export const agentMemoriesRelations = relations(agentMemories, ({one}) => ({
	account: one(accounts, {
		fields: [agentMemories.accountId],
		references: [accounts.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [agentMemories.boardInstanceId],
		references: [boardInstances.id]
	}),
	category: one(categories, {
		fields: [agentMemories.categoryId],
		references: [categories.id]
	}),
	conversation: one(conversations, {
		fields: [agentMemories.conversationId],
		references: [conversations.id]
	}),
	task: one(tasks, {
		fields: [agentMemories.taskId],
		references: [tasks.id]
	}),
}));

export const taskRunsRelations = relations(taskRuns, ({one, many}) => ({
	account: one(accounts, {
		fields: [taskRuns.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [taskRuns.agentId],
		references: [agents.id]
	}),
	orchestratedTask: one(orchestratedTasks, {
		fields: [taskRuns.orchestratedTaskId],
		references: [orchestratedTasks.id]
	}),
	taskRun: one(taskRuns, {
		fields: [taskRuns.parentRunId],
		references: [taskRuns.id],
		relationName: "taskRuns_parentRunId_taskRuns_id"
	}),
	taskRuns: many(taskRuns, {
		relationName: "taskRuns_parentRunId_taskRuns_id"
	}),
	pod: one(pods, {
		fields: [taskRuns.podId],
		references: [pods.id]
	}),
	task: one(tasks, {
		fields: [taskRuns.taskId],
		references: [tasks.id]
	}),
}));

export const orchestratedTasksRelations = relations(orchestratedTasks, ({one, many}) => ({
	taskRuns: many(taskRuns),
	agentApprovalRequests: many(agentApprovalRequests),
	account: one(accounts, {
		fields: [orchestratedTasks.accountId],
		references: [accounts.id]
	}),
	orchestratedTask: one(orchestratedTasks, {
		fields: [orchestratedTasks.parentOrchestratedTaskId],
		references: [orchestratedTasks.id],
		relationName: "orchestratedTasks_parentOrchestratedTaskId_orchestratedTasks_id"
	}),
	orchestratedTasks: many(orchestratedTasks, {
		relationName: "orchestratedTasks_parentOrchestratedTaskId_orchestratedTasks_id"
	}),
	pod: one(pods, {
		fields: [orchestratedTasks.podId],
		references: [pods.id]
	}),
	orchestratedTaskDeps_downstreamTaskId: many(orchestratedTaskDeps, {
		relationName: "orchestratedTaskDeps_downstreamTaskId_orchestratedTasks_id"
	}),
	orchestratedTaskDeps_upstreamTaskId: many(orchestratedTaskDeps, {
		relationName: "orchestratedTaskDeps_upstreamTaskId_orchestratedTasks_id"
	}),
}));

export const categorySkillsRelations = relations(categorySkills, ({one}) => ({
	category: one(categories, {
		fields: [categorySkills.categoryId],
		references: [categories.id]
	}),
	skill: one(skills, {
		fields: [categorySkills.skillId],
		references: [skills.id]
	}),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({one}) => ({
	taskDag: one(taskDags, {
		fields: [taskDependencies.dagId],
		references: [taskDags.id]
	}),
	boardRoute: one(boardRoutes, {
		fields: [taskDependencies.routeId],
		references: [boardRoutes.id]
	}),
	task_sourceTaskId: one(tasks, {
		fields: [taskDependencies.sourceTaskId],
		references: [tasks.id],
		relationName: "taskDependencies_sourceTaskId_tasks_id"
	}),
	task_targetTaskId: one(tasks, {
		fields: [taskDependencies.targetTaskId],
		references: [tasks.id],
		relationName: "taskDependencies_targetTaskId_tasks_id"
	}),
}));

export const autopilotTriggersRelations = relations(autopilotTriggers, ({one}) => ({
	heartbeatConfig: one(heartbeatConfigs, {
		fields: [autopilotTriggers.autopilotId],
		references: [heartbeatConfigs.id]
	}),
}));

export const boardTemplatesRelations = relations(boardTemplates, ({one, many}) => ({
	account: one(accounts, {
		fields: [boardTemplates.accountId],
		references: [accounts.id]
	}),
	boardInstances: many(boardInstances),
}));

export const agentApprovalRequestsRelations = relations(agentApprovalRequests, ({one}) => ({
	orchestratedTask: one(orchestratedTasks, {
		fields: [agentApprovalRequests.orchestratedTaskId],
		references: [orchestratedTasks.id]
	}),
	agent: one(agents, {
		fields: [agentApprovalRequests.requestedByAgentId],
		references: [agents.id]
	}),
}));

export const agentActivityRelations = relations(agentActivity, ({one}) => ({
	account: one(accounts, {
		fields: [agentActivity.accountId],
		references: [accounts.id]
	}),
	agent: one(agents, {
		fields: [agentActivity.agentId],
		references: [agents.id]
	}),
	boardInstance: one(boardInstances, {
		fields: [agentActivity.boardId],
		references: [boardInstances.id]
	}),
	conversation: one(conversations, {
		fields: [agentActivity.conversationId],
		references: [conversations.id]
	}),
	taskDag: one(taskDags, {
		fields: [agentActivity.dagId],
		references: [taskDags.id]
	}),
	task: one(tasks, {
		fields: [agentActivity.taskId],
		references: [tasks.id]
	}),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({one}) => ({
	webhook: one(webhooks, {
		fields: [webhookDeliveries.webhookId],
		references: [webhooks.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	account: one(accounts, {
		fields: [subscriptions.accountId],
		references: [accounts.id]
	}),
	plan: one(plans, {
		fields: [subscriptions.planId],
		references: [plans.id]
	}),
}));

export const plansRelations = relations(plans, ({many}) => ({
	subscriptions: many(subscriptions),
}));

export const orchestratedTaskDepsRelations = relations(orchestratedTaskDeps, ({one}) => ({
	orchestratedTask_downstreamTaskId: one(orchestratedTasks, {
		fields: [orchestratedTaskDeps.downstreamTaskId],
		references: [orchestratedTasks.id],
		relationName: "orchestratedTaskDeps_downstreamTaskId_orchestratedTasks_id"
	}),
	orchestratedTask_upstreamTaskId: one(orchestratedTasks, {
		fields: [orchestratedTaskDeps.upstreamTaskId],
		references: [orchestratedTasks.id],
		relationName: "orchestratedTaskDeps_upstreamTaskId_orchestratedTasks_id"
	}),
}));

export const agentSkillsRelations = relations(agentSkills, ({one}) => ({
	agent: one(agents, {
		fields: [agentSkills.agentId],
		references: [agents.id]
	}),
	skill: one(skills, {
		fields: [agentSkills.skillId],
		references: [skills.id]
	}),
}));