import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';

/**
 * BackboneDefinitionsService (F009)
 *
 * Returns the catalogue of available backbone types from the
 * backbone_definitions DB table so the frontend can render a
 * "pick your backbone" UI without hard-coding slugs.
 *
 * Falls back to the in-memory BACKBONE_DEFINITIONS constant if the DB
 * table is unavailable (e.g. during initial setup before migrations run).
 */

export interface BackboneDefinition {
  slug: string;
  label: string;
  description: string;
  protocol?: string;
  icon?: string;
  color?: string;
  /** Config fields the frontend should render (informational) */
  configSchema: BackboneConfigField[];
}

export interface BackboneConfigField {
  key: string;
  label: string;
  type: 'string' | 'url' | 'secret' | 'number' | 'boolean' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[]; // for 'select' type
}

/**
 * Fallback static catalogue used when the DB is unavailable.
 */
const FALLBACK_DEFINITIONS: BackboneDefinition[] = [
  {
    slug: 'openclaw',
    label: 'OpenClaw',
    description:
      'Connect to a self-hosted OpenClaw instance via WebSocket protocol.',
    protocol: 'websocket',
    configSchema: [
      {
        key: 'api_url',
        label: 'API URL',
        type: 'url',
        required: true,
        placeholder: 'https://your-openclaw.example.com',
      },
      {
        key: 'api_key',
        label: 'API Key',
        type: 'secret',
        required: true,
        placeholder: 'sk-...',
      },
      {
        key: 'agent_id',
        label: 'Agent ID',
        type: 'string',
        required: false,
        placeholder: 'Optional default agent',
      },
    ],
  },
];

@Injectable()
export class BackboneDefinitionsService {
  private readonly logger = new Logger(BackboneDefinitionsService.name);

  constructor(
    private readonly registry: BackboneAdapterRegistry,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /**
   * Return all known backbone definitions from the DB.
   * Only includes definitions whose adapter is actually registered.
   */
  async findAll(): Promise<BackboneDefinition[]> {
    const all = await this.loadFromDb();
    return all.filter((def) => this.registry.has(def.slug));
  }

  /**
   * Return all definitions regardless of adapter registration status.
   * Useful for the admin UI to show what could be configured.
   */
  async findAllIncludingUnavailable(): Promise<
    Array<BackboneDefinition & { available: boolean }>
  > {
    const all = await this.loadFromDb();
    return all.map((def) => ({
      ...def,
      available: this.registry.has(def.slug),
    }));
  }

  /**
   * Get a single definition by slug
   */
  async findBySlug(slug: string): Promise<BackboneDefinition | undefined> {
    const all = await this.loadFromDb();
    return all.find((d) => d.slug === slug);
  }

  // ─── Private ─────────────────────────────────────────────

  /**
   * Load definitions from backbone_definitions table.
   * Returns fallback static list if the query fails.
   */
  private async loadFromDb(): Promise<BackboneDefinition[]> {
    try {
      const client = this.supabaseAdmin.getClient();
      const { data, error } = await client
        .from('backbone_definitions')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        this.logger.warn(
          `backbone_definitions table unavailable, using fallback: ${error.message}`,
        );
        return FALLBACK_DEFINITIONS;
      }

      if (!data || data.length === 0) {
        this.logger.warn(
          'backbone_definitions table is empty, using fallback definitions',
        );
        return FALLBACK_DEFINITIONS;
      }

      return data.map((row) => this.rowToDefinition(row));
    } catch (err: any) {
      this.logger.warn(
        `Failed to load backbone_definitions from DB: ${err.message}. Using fallback.`,
      );
      return FALLBACK_DEFINITIONS;
    }
  }

  /**
   * Convert a DB row to a BackboneDefinition.
   * The config_schema in the DB is JSON Schema; we convert required[] + properties
   * into the BackboneConfigField[] format the frontend expects.
   */
  private rowToDefinition(row: any): BackboneDefinition {
    const configSchema = this.parseConfigSchema(row.config_schema);

    return {
      slug: row.slug as string,
      label: row.name as string,
      description: (row.description as string) || '',
      protocol: row.protocol as string | undefined,
      icon: row.icon as string | undefined,
      color: row.color as string | undefined,
      configSchema,
    };
  }

  /**
   * Parse JSON Schema config_schema into BackboneConfigField[].
   *
   * The DB stores config_schema as JSON Schema with:
   *   { type: 'object', required: [...], properties: { key: { type, title, format, description } } }
   *
   * We convert to BackboneConfigField[] for the frontend.
   */
  private parseConfigSchema(schema: any): BackboneConfigField[] {
    if (!schema || typeof schema !== 'object') return [];

    const properties = schema.properties as Record<string, any> | undefined;
    if (!properties) return [];

    const required: string[] = Array.isArray(schema.required)
      ? (schema.required as string[])
      : [];

    return Object.entries(properties).map(([key, prop]) => {
      const typedProp = prop as Record<string, any>;
      const fieldType = this.mapJsonSchemaType(
        typedProp.type as string,
        typedProp.format as string | undefined,
      );

      return {
        key,
        label: (typedProp.title as string) || key,
        type: fieldType,
        required: required.includes(key),
        placeholder:
          (typedProp.description as string) ||
          (typedProp.default !== undefined
            ? String(typedProp.default)
            : undefined),
      };
    });
  }

  private mapJsonSchemaType(
    type: string,
    format?: string,
  ): BackboneConfigField['type'] {
    if (format === 'password') return 'secret';
    if (format === 'uri' || format === 'url') return 'url';
    switch (type) {
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'string';
    }
  }
}
