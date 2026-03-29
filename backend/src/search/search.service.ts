import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EmbeddingService } from '../ai-assistant/services/embedding.service';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: string;
  url: string;
  similarity?: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async searchGlobal(query: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Try hybrid search (vector + fallback) if embeddings are configured
    if (this.embeddingService.isConfigured()) {
      return this.hybridSearch(query);
    }

    // Fallback to traditional ILIKE search
    return this.ilikeSearch(query);
  }

  /**
   * Hybrid search: Attempts vector search first, falls back to ILIKE if needed
   */
  private async hybridSearch(query: string) {
    const supabase = this.supabaseService.getAdminClient();

    try {
      // Generate embedding for the search query
      const queryEmbedding =
        await this.embeddingService.generateEmbedding(query);

      // Perform vector searches in parallel
      const [vectorUsersRes, vectorProjectsRes] = await Promise.all([
        supabase.rpc('search_users_vector', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_limit: 5,
          similarity_threshold: 0.3,
        }),
        supabase.rpc('search_projects_vector', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_limit: 5,
          similarity_threshold: 0.3,
        }),
      ]);

      // Also do traditional search for accounts (no description field to embed)
      const searchTerm = `%${query}%`;
      const accountsRes = await supabase
        .from('accounts')
        .select('id, name')
        .ilike('name', searchTerm)
        .limit(5);

      // Process vector results
      const vectorUsers = (vectorUsersRes.data || []).map((u: any) => ({
        id: u.id,
        title: u.name || u.email,
        subtitle: u.email,
        type: 'user',
        url: `/admin/users?search=${u.email}`,
        similarity: u.similarity,
      }));

      const vectorProjects = (vectorProjectsRes.data || []).map((p: any) => ({
        id: p.id,
        title: p.name,
        subtitle: 'Project',
        type: 'project',
        url: `/dashboard/projects/${p.id}`,
        similarity: p.similarity,
      }));

      // If vector search returned few results, supplement with ILIKE search
      let users = vectorUsers;
      let projects = vectorProjects;

      if (vectorUsers.length < 3) {
        const ilikeUsersRes = await supabase
          .from('users')
          .select('id, email, name')
          .or(`email.ilike.${searchTerm},name.ilike.${searchTerm}`)
          .limit(5);

        const ilikeUsers = (ilikeUsersRes.data || []).map((u: any) => ({
          id: u.id,
          title: u.name || u.email,
          subtitle: u.email,
          type: 'user',
          url: `/admin/users?search=${u.email}`,
        }));

        // Merge and deduplicate
        users = this.mergeResults(vectorUsers, ilikeUsers);
      }

      if (vectorProjects.length < 3) {
        const ilikeProjectsRes = await supabase
          .from('projects')
          .select('id, name, account_id')
          .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .limit(5);

        const ilikeProjects = (ilikeProjectsRes.data || []).map((p: any) => ({
          id: p.id,
          title: p.name,
          subtitle: 'Project',
          type: 'project',
          url: `/dashboard/projects/${p.id}`,
        }));

        projects = this.mergeResults(vectorProjects, ilikeProjects);
      }

      if (accountsRes.error)
        throw new InternalServerErrorException(accountsRes.error.message);

      return {
        users: users.slice(0, 5),
        accounts: accountsRes.data.map((a: any) => ({
          id: a.id,
          title: a.name,
          subtitle: 'Account',
          type: 'account',
          url: `/admin/accounts?search=${a.name}`,
        })),
        projects: projects.slice(0, 5),
      };
    } catch (error: any) {
      this.logger.warn(
        `Vector search failed, falling back to ILIKE: ${error.message}`,
      );
      return this.ilikeSearch(query);
    }
  }

  /**
   * Traditional ILIKE search (fallback when embeddings unavailable)
   */
  private async ilikeSearch(query: string) {
    const supabase = this.supabaseService.getAdminClient();
    const searchTerm = `%${query}%`;

    // Parallel queries
    const [usersRes, accountsRes, projectsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name')
        .or(`email.ilike.${searchTerm},name.ilike.${searchTerm}`)
        .limit(5),
      supabase
        .from('accounts')
        .select('id, name')
        .ilike('name', searchTerm)
        .limit(5),
      supabase
        .from('projects')
        .select('id, name, account_id')
        .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .limit(5),
    ]);

    if (usersRes.error)
      throw new InternalServerErrorException(usersRes.error.message);
    if (accountsRes.error)
      throw new InternalServerErrorException(accountsRes.error.message);
    if (projectsRes.error)
      throw new InternalServerErrorException(projectsRes.error.message);

    return {
      users: usersRes.data.map((u: any) => ({
        id: u.id,
        title: u.name || u.email,
        subtitle: u.email,
        type: 'user',
        url: `/admin/users?search=${u.email}`,
      })),
      accounts: accountsRes.data.map((a: any) => ({
        id: a.id,
        title: a.name,
        subtitle: 'Account',
        type: 'account',
        url: `/admin/accounts?search=${a.name}`,
      })),
      projects: projectsRes.data.map((p: any) => ({
        id: p.id,
        title: p.name,
        subtitle: 'Project',
        type: 'project',
        url: `/dashboard/projects/${p.id}`,
      })),
    };
  }

  /**
   * Merge vector and ILIKE results, prioritizing vector results and removing duplicates
   */
  private mergeResults(
    vectorResults: SearchResult[],
    ilikeResults: SearchResult[],
  ): SearchResult[] {
    const seen = new Set(vectorResults.map((r) => r.id));
    const merged = [...vectorResults];

    for (const result of ilikeResults) {
      if (!seen.has(result.id)) {
        merged.push(result);
        seen.add(result.id);
      }
    }

    // Sort by similarity if available (vector results first)
    return merged.sort((a, b) => {
      if (a.similarity !== undefined && b.similarity !== undefined) {
        return b.similarity - a.similarity;
      }
      if (a.similarity !== undefined) return -1;
      if (b.similarity !== undefined) return 1;
      return 0;
    });
  }
}
