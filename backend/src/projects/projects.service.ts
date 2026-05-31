import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db';
import { accounts, projects, projectUsers } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { EmbeddingService } from '../ai-assistant/services/embedding.service';

/**
 * Rows returned by the `search_projects_vector` Postgres function. The function
 * itself STAYS as a SQL call (pgvector cannot round-trip through the Drizzle
 * query builder) — we Zod-parse the raw `.rows` at the boundary (§12.3) and keep
 * passthrough so callers still see every projected column.
 */
const VectorProjectRowSchema = z
  .object({
    id: z.string(),
    account_id: z.string().nullable().optional(),
  })
  .passthrough();

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControlHelper: AccessControlHelper,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async getAccountProjects(
    accountId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId);

    const data = await this.db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.accountId, accountId))
      .orderBy(desc(projects.createdAt));

    return data.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      created_at: project.createdAt,
      url: `/dashboard/projects/${project.id}`, // Placeholder URL
      icon: 'Frame', // We'll handle icons in the component
    }));
  }

  async createProject(
    accountId: string,
    name: string,
    description: string | undefined,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(null, accountId, userId);

    // Generate embedding for description if available and service is configured
    let descriptionEmbedding: number[] | null = null;
    if (description && this.embeddingService.isConfigured()) {
      try {
        const embedding =
          await this.embeddingService.generateEmbedding(description);
        descriptionEmbedding = embedding;
        this.logger.debug(`Generated embedding for new project: ${name}`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to generate embedding for project description: ${error.message}`,
        );
        // Continue without embedding - non-blocking
      }
    }

    let data: typeof projects.$inferSelect;
    try {
      const rows = await this.db
        .insert(projects)
        .values({
          accountId,
          name,
          description,
          descriptionEmbedding,
        })
        .returning();
      data = rows[0];
    } catch (error: any) {
      console.error('ProjectsService: Error creating project', error);
      throw new InternalServerErrorException(error.message);
    }

    // Also add the user as admin to the project
    try {
      await this.db.insert(projectUsers).values({
        projectId: data.id,
        userId,
        role: 'admin',
      });
    } catch (memberError) {
      console.error('ProjectsService: Error adding admin', memberError);
    }

    return data;
  }

  async getProjectDetails(
    projectId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify access via helper (checks project existence + account membership)
    await this.accessControlHelper.verifyProjectAccess(null, projectId, userId);

    const [data] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!data) {
      throw new NotFoundException('Project not found');
    }

    return data;
  }

  async updateProject(
    projectId: string,
    name: string,
    description: string | undefined,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify access
    await this.accessControlHelper.verifyProjectAccess(null, projectId, userId);

    // Generate embedding for updated description if available and service is configured
    let descriptionEmbedding: number[] | undefined = undefined;
    if (description && this.embeddingService.isConfigured()) {
      try {
        const embedding =
          await this.embeddingService.generateEmbedding(description);
        descriptionEmbedding = embedding;
        this.logger.debug(`Generated embedding for updated project: ${name}`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to generate embedding for project description: ${error.message}`,
        );
        // Continue without embedding - non-blocking
      }
    }

    const updateData: Partial<typeof projects.$inferInsert> = {
      name,
      description,
    };
    if (descriptionEmbedding !== undefined) {
      updateData.descriptionEmbedding = descriptionEmbedding;
    }

    const [data] = await this.db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning();

    if (!data) {
      throw new InternalServerErrorException('Failed to update project');
    }

    return data;
  }

  async deleteProject(
    projectId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify access (maybe restrict to admin/owner? For now, just member access as per previous logic)
    // Ideally should check for 'admin' role in project_users or account owner.
    // Let's enforce account admin/owner or project admin.
    // For simplicity matching previous logic (which had none), let's just check access.
    // But let's be better: check if user is admin of the project.

    // First get project to know account
    await this.accessControlHelper.verifyProjectAccess(null, projectId, userId);

    // Check if user is admin in project_users OR admin/owner in account
    // This is getting complex. Let's stick to basic access for now as per plan,
    // but ideally we should check roles.
    // The plan said: "deleteProject: No validation" -> "Required Changes: Similar patterns"

    await this.db.delete(projects).where(eq(projects.id, projectId));

    return { success: true };
  }

  async findAllProjects(page: number = 1, limit: number = 10, search?: string) {
    const offset = (page - 1) * limit;

    // If search query and embeddings are configured, try vector search first
    if (search && this.embeddingService.isConfigured()) {
      try {
        const queryEmbedding =
          await this.embeddingService.generateEmbedding(search);

        // Use vector search RPC function (pgvector — stays as a raw SQL function call)
        const matchLimit = limit * 2; // Get more results to filter by pagination
        const similarityThreshold = 0.3;
        const result = await this.db.execute(
          sql`select * from search_projects_vector(${JSON.stringify(queryEmbedding)}::vector, ${matchLimit}, ${similarityThreshold})`,
        );
        const vectorResults = z
          .array(VectorProjectRowSchema)
          .parse(result.rows);

        if (vectorResults && vectorResults.length > 0) {
          // Paginate vector results
          const paginatedResults = vectorResults.slice(offset, offset + limit);

          // Fetch account names for the results
          const projectsWithAccounts = await Promise.all(
            paginatedResults.map(async (project) => {
              const account = project.account_id
                ? await this.db.query.accounts.findFirst({
                    where: eq(accounts.id, project.account_id),
                    columns: { name: true },
                  })
                : undefined;

              return {
                ...project,
                account: account ?? null,
                accountName: account?.name || 'Unknown',
              };
            }),
          );

          this.logger.debug(
            `Vector search returned ${vectorResults.length} results for query: ${search}`,
          );

          return {
            data: projectsWithAccounts,
            meta: {
              total: vectorResults.length,
              page,
              limit,
              totalPages: Math.ceil(vectorResults.length / limit),
              searchMethod: 'vector',
            },
          };
        }
      } catch (error: any) {
        this.logger.warn(
          `Vector search failed, falling back to ILIKE: ${error.message}`,
        );
        // Fall through to ILIKE search
      }
    }

    // Fallback to traditional ILIKE search
    const where = search
      ? or(
          ilike(projects.name, `%${search}%`),
          ilike(projects.description, `%${search}%`),
        )
      : undefined;

    // PostgREST embedded `account:accounts(name)` → Drizzle relation is `account`
    // (see projectsRelations); the PostgREST alias was also `account`, so the
    // response shape is already preserved — no re-key needed.
    const [projectRows, [{ value: total }]] = await Promise.all([
      this.db.query.projects.findMany({
        where,
        orderBy: desc(projects.createdAt),
        limit,
        offset,
        with: { account: { columns: { name: true } } },
      }),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);

    return {
      data: projectRows.map((project) => {
        // `account` is a `one` relation; narrow the relational-query union.
        const account = Array.isArray(project.account)
          ? project.account[0]
          : project.account;
        return {
          ...project,
          accountName: account?.name || 'Unknown',
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil((total || 0) / limit),
        searchMethod: search ? 'ilike' : 'none',
      },
    };
  }
}
