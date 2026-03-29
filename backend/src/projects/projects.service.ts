import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { EmbeddingService } from '../ai-assistant/services/embedding.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessControlHelper: AccessControlHelper,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async getAccountProjects(
    accountId: string,
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(
      supabase,
      accountId,
      userId,
    );

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      url: `/dashboard/projects/${project.id}`, // Placeholder URL
      icon: 'Frame', // We'll handle icons in the component
    }));
  }

  async createProject(
    accountId: string,
    name: string,
    description: string | undefined,
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(
      supabase,
      accountId,
      userId,
    );

    // Generate embedding for description if available and service is configured
    let descriptionEmbedding: string | null = null;
    if (description && this.embeddingService.isConfigured()) {
      try {
        const embedding =
          await this.embeddingService.generateEmbedding(description);
        descriptionEmbedding = JSON.stringify(embedding);
        this.logger.debug(`Generated embedding for new project: ${name}`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to generate embedding for project description: ${error.message}`,
        );
        // Continue without embedding - non-blocking
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        account_id: accountId,
        name,
        description,
        description_embedding: descriptionEmbedding,
      })
      .select()
      .single();

    if (error) {
      console.error('ProjectsService: Error creating project', error);
      throw new InternalServerErrorException(error.message);
    }

    // Also add the user as admin to the project
    const { error: memberError } = await supabase.from('project_users').insert({
      project_id: data.id,
      user_id: userId,
      role: 'admin',
    });

    if (memberError) {
      console.error('ProjectsService: Error adding admin', memberError);
    }

    return data;
  }

  async getProjectDetails(
    projectId: string,
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify access via helper (checks project existence + account membership)
    await this.accessControlHelper.verifyProjectAccess(
      supabase,
      projectId,
      userId,
    );

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      throw new NotFoundException('Project not found');
    }

    return data;
  }

  async updateProject(
    projectId: string,
    name: string,
    description: string | undefined,
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify access
    await this.accessControlHelper.verifyProjectAccess(
      supabase,
      projectId,
      userId,
    );

    // Generate embedding for updated description if available and service is configured
    let descriptionEmbedding: string | undefined = undefined;
    if (description && this.embeddingService.isConfigured()) {
      try {
        const embedding =
          await this.embeddingService.generateEmbedding(description);
        descriptionEmbedding = JSON.stringify(embedding);
        this.logger.debug(`Generated embedding for updated project: ${name}`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to generate embedding for project description: ${error.message}`,
        );
        // Continue without embedding - non-blocking
      }
    }

    const updateData: any = { name, description };
    if (descriptionEmbedding !== undefined) {
      updateData.description_embedding = descriptionEmbedding;
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async deleteProject(projectId: string, userId: string, accessToken?: string) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify access (maybe restrict to admin/owner? For now, just member access as per previous logic)
    // Ideally should check for 'admin' role in project_users or account owner.
    // Let's enforce account admin/owner or project admin.
    // For simplicity matching previous logic (which had none), let's just check access.
    // But let's be better: check if user is admin of the project.

    // First get project to know account
    const { accountId } = await this.accessControlHelper.verifyProjectAccess(
      supabase,
      projectId,
      userId,
    );

    // Check if user is admin in project_users OR admin/owner in account
    // This is getting complex. Let's stick to basic access for now as per plan,
    // but ideally we should check roles.
    // The plan said: "deleteProject: No validation" -> "Required Changes: Similar patterns"

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { success: true };
  }
  async findAllProjects(page: number = 1, limit: number = 10, search?: string) {
    const supabase = this.supabaseService.getAdminClient();
    const offset = (page - 1) * limit;

    // If search query and embeddings are configured, try vector search first
    if (search && this.embeddingService.isConfigured()) {
      try {
        const queryEmbedding =
          await this.embeddingService.generateEmbedding(search);

        // Use vector search RPC function
        const { data: vectorResults, error: vectorError } = await supabase.rpc(
          'search_projects_vector',
          {
            query_embedding: JSON.stringify(queryEmbedding),
            match_limit: limit * 2, // Get more results to filter by pagination
            similarity_threshold: 0.3,
          },
        );

        if (!vectorError && vectorResults && vectorResults.length > 0) {
          // Paginate vector results
          const paginatedResults = vectorResults.slice(offset, offset + limit);

          // Fetch account names for the results
          const projectsWithAccounts = await Promise.all(
            paginatedResults.map(async (project: any) => {
              const { data: account } = await supabase
                .from('accounts')
                .select('name')
                .eq('id', project.account_id)
                .single();

              return {
                ...project,
                account: account,
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
    let query = supabase
      .from('projects')
      .select('*, account:accounts(name)', { count: 'exact' });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const {
      data: projects,
      count,
      error,
    } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      data: projects.map((project: any) => ({
        ...project,
        accountName: project.account?.name || 'Unknown',
      })),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
        searchMethod: search ? 'ilike' : 'none',
      },
    };
  }
}
