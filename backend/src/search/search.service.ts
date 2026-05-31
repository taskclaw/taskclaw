import { Injectable, Inject, Logger } from '@nestjs/common';
import { ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../db';
import { users, accounts, projects } from '../db/schema';
import { EmbeddingService } from '../ai-assistant/services/embedding.service';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: string;
  url: string;
  similarity?: number;
}

/**
 * Zod schemas for the vector-search SQL function results. The vector RPCs stay
 * as raw SQL function calls (`select * from search_*_vector(...)`); their rows
 * are untyped, so parse-don't-cast (§12.3) at the boundary.
 */
const vectorUserRowSchema = z.object({
  id: z.string(),
  // `users.email` is NOT NULL; the function selects it directly.
  email: z.string(),
  name: z.string().nullable(),
  similarity: z.number().nullable(),
});

const vectorProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  similarity: z.number().nullable(),
});

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async searchGlobal(query: string) {
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
    try {
      // Generate embedding for the search query
      const queryEmbedding =
        await this.embeddingService.generateEmbedding(query);
      const embedding = JSON.stringify(queryEmbedding);

      // Perform vector searches in parallel.
      // Vector-search functions STAY as SQL function calls (Drizzle gotchas guide).
      const [vectorUsersRes, vectorProjectsRes] = await Promise.all([
        this.db.execute(
          sql`select * from search_users_vector(${embedding}::vector, ${5}, ${0.3})`,
        ),
        this.db.execute(
          sql`select * from search_projects_vector(${embedding}::vector, ${5}, ${0.3})`,
        ),
      ]);

      // Also do traditional search for accounts (no description field to embed)
      const searchTerm = `%${query}%`;
      const accountsData = await this.db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(ilike(accounts.name, searchTerm))
        .limit(5);

      // Process vector results (Zod-parse the raw SQL rows)
      const vectorUsers = z
        .array(vectorUserRowSchema)
        .parse(vectorUsersRes.rows ?? [])
        .map((u) => ({
          id: u.id,
          title: u.name || u.email,
          subtitle: u.email,
          type: 'user',
          url: `/admin/users?search=${u.email}`,
          similarity: u.similarity ?? undefined,
        }));

      const vectorProjects = z
        .array(vectorProjectRowSchema)
        .parse(vectorProjectsRes.rows ?? [])
        .map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: 'Project',
          type: 'project',
          url: `/dashboard/projects/${p.id}`,
          similarity: p.similarity ?? undefined,
        }));

      // If vector search returned few results, supplement with ILIKE search
      let users_: SearchResult[] = vectorUsers;
      let projects_: SearchResult[] = vectorProjects;

      if (vectorUsers.length < 3) {
        const ilikeUsersData = await this.db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(or(ilike(users.email, searchTerm), ilike(users.name, searchTerm)))
          .limit(5);

        const ilikeUsers = ilikeUsersData.map((u) => ({
          id: u.id,
          title: u.name || u.email,
          subtitle: u.email,
          type: 'user',
          url: `/admin/users?search=${u.email}`,
        }));

        // Merge and deduplicate
        users_ = this.mergeResults(vectorUsers, ilikeUsers);
      }

      if (vectorProjects.length < 3) {
        const ilikeProjectsData = await this.db
          .select({
            id: projects.id,
            name: projects.name,
            accountId: projects.accountId,
          })
          .from(projects)
          .where(
            or(
              ilike(projects.name, searchTerm),
              ilike(projects.description, searchTerm),
            ),
          )
          .limit(5);

        const ilikeProjects = ilikeProjectsData.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: 'Project',
          type: 'project',
          url: `/dashboard/projects/${p.id}`,
        }));

        projects_ = this.mergeResults(vectorProjects, ilikeProjects);
      }

      return {
        users: users_.slice(0, 5),
        accounts: accountsData.map((a) => ({
          id: a.id,
          title: a.name,
          subtitle: 'Account',
          type: 'account',
          url: `/admin/accounts?search=${a.name}`,
        })),
        projects: projects_.slice(0, 5),
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
    const searchTerm = `%${query}%`;

    // Parallel queries
    const [usersData, accountsData, projectsData] = await Promise.all([
      this.db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(or(ilike(users.email, searchTerm), ilike(users.name, searchTerm)))
        .limit(5),
      this.db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(ilike(accounts.name, searchTerm))
        .limit(5),
      this.db
        .select({
          id: projects.id,
          name: projects.name,
          accountId: projects.accountId,
        })
        .from(projects)
        .where(
          or(
            ilike(projects.name, searchTerm),
            ilike(projects.description, searchTerm),
          ),
        )
        .limit(5),
    ]);

    return {
      users: usersData.map((u) => ({
        id: u.id,
        title: u.name || u.email,
        subtitle: u.email,
        type: 'user',
        url: `/admin/users?search=${u.email}`,
      })),
      accounts: accountsData.map((a) => ({
        id: a.id,
        title: a.name,
        subtitle: 'Account',
        type: 'account',
        url: `/admin/accounts?search=${a.name}`,
      })),
      projects: projectsData.map((p) => ({
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
