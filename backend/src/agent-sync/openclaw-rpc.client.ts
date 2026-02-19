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
 * HTTP client for calling TaskClaw plugin RPC endpoints on the OpenClaw gateway.
 * Uses the same gateway URL + auth token already stored in ai_provider_configs.
 */
@Injectable()
export class OpenClawRpcClient {
  private readonly logger = new Logger(OpenClawRpcClient.name);

  /**
   * Call a taskclaw.* RPC method on the OpenClaw gateway.
   */
  async call<T = any>(
    config: OpenClawConfig,
    method: string,
    body?: Record<string, any>,
  ): Promise<RpcResponse<T>> {
    const endpoint = `${config.api_url}/rpc/${method}`;

    this.logger.debug(`RPC call: ${method} → ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.api_key}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `RPC ${method} failed (HTTP ${response.status}): ${errorText}`,
        );
        return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      // OpenClaw RPC wraps the response — unwrap the respond(success, payload)
      if (data && typeof data === 'object') {
        if (data.ok === false && data.error) {
          return { ok: false, error: data.error };
        }
        return { ok: true, data: data as T };
      }

      return { ok: true, data: data as T };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.logger.error(`RPC ${method} timed out after 15s`);
        return { ok: false, error: 'Request timed out after 15 seconds' };
      }
      this.logger.error(`RPC ${method} error: ${err.message}`);
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
    return this.call(config, 'taskclaw.syncSkill', {
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
    return this.call(config, 'taskclaw.deleteSkill', { categorySlug });
  }

  /**
   * Verify a skill file exists and return its hash.
   */
  async verifySkill(
    config: OpenClawConfig,
    categorySlug: string,
  ): Promise<RpcResponse<{ exists: boolean; hash: string | null }>> {
    return this.call(config, 'taskclaw.verifySkill', { categorySlug });
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
    return this.call(config, 'taskclaw.listSkills');
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
    return this.call(config, 'taskclaw.health');
  }
}
