import { Injectable, Logger } from '@nestjs/common';

export interface OpenClawConfig {
  api_url: string;
  api_key: string;
  agent_id?: string;
}

export interface RpcResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * HTTP client for calling TaskClaw plugin endpoints on the OpenClaw gateway.
 * Uses the same gateway URL + auth token already stored in ai_provider_configs.
 *
 * Endpoints (on the OpenClaw gateway):
 *   POST /api/taskclaw/sync-skill
 *   POST /api/taskclaw/delete-skill
 *   POST /api/taskclaw/verify-skill
 *   GET  /api/taskclaw/list-skills
 *   GET  /api/taskclaw/health
 */
@Injectable()
export class OpenClawRpcClient {
  private readonly logger = new Logger(OpenClawRpcClient.name);

  /**
   * Call a TaskClaw plugin HTTP endpoint on the OpenClaw gateway.
   */
  async call<T = any>(
    config: OpenClawConfig,
    route: string,
    method: 'GET' | 'POST' = 'POST',
    body?: Record<string, any>,
  ): Promise<RpcResponse<T>> {
    const endpoint = `${config.api_url}/api/taskclaw/${route}`;

    this.logger.debug(`RPC call: ${route} → ${method} ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.api_key}`,
        },
        body: method === 'POST' && body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `RPC ${route} failed (HTTP ${response.status}): ${errorText}`,
        );
        return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      if (data && typeof data === 'object') {
        if (data.ok === false && data.error) {
          return { ok: false, error: data.error };
        }
        return { ok: true, data: data as T };
      }

      return { ok: true, data: data as T };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.logger.error(`RPC ${route} timed out after 15s`);
        return { ok: false, error: 'Request timed out after 15 seconds' };
      }
      this.logger.error(`RPC ${route} error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Write/update a SKILL.md file for a category.
   */
  async syncSkill(
    config: OpenClawConfig,
    categorySlug: string,
    content: string,
    hash: string,
  ): Promise<RpcResponse<{ path: string; hash: string }>> {
    return this.call(config, 'sync-skill', 'POST', {
      categorySlug,
      content,
      hash,
    });
  }

  /**
   * Delete a category's skill file from the server.
   */
  async deleteSkill(
    config: OpenClawConfig,
    categorySlug: string,
  ): Promise<RpcResponse<{ deleted: boolean }>> {
    return this.call(config, 'delete-skill', 'POST', { categorySlug });
  }

  /**
   * Verify a skill file exists and return its hash.
   */
  async verifySkill(
    config: OpenClawConfig,
    categorySlug: string,
  ): Promise<RpcResponse<{ exists: boolean; hash: string | null }>> {
    return this.call(config, 'verify-skill', 'POST', { categorySlug });
  }

  /**
   * List all taskclaw-managed skill directories.
   */
  async listSkills(
    config: OpenClawConfig,
  ): Promise<
    RpcResponse<{
      count: number;
      skills: Array<{ categorySlug: string; hash: string | null }>;
    }>
  > {
    return this.call(config, 'list-skills', 'GET');
  }

  /**
   * Plugin health check.
   */
  async health(
    config: OpenClawConfig,
  ): Promise<
    RpcResponse<{
      ok: boolean;
      pluginVersion: string;
      managedSkillCount: number;
    }>
  > {
    return this.call(config, 'health', 'GET');
  }
}
