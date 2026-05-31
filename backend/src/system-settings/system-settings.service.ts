import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { systemSettings } from '../db/schema';
import { UpdateSystemSettingsDto } from './dto/update-settings.dto';

/**
 * System Settings interface
 * NOTE: theme_mode has been removed - mode is now client-side only (localStorage)
 */
export interface SystemSettings {
  id: boolean;
  allow_multiple_projects: boolean;
  allow_multiple_teams: boolean;
  theme_set: string;
  extended_settings: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Theme Settings interface (public endpoint)
 * NOTE: Only theme_set is managed globally by the Super Admin
 * Mode (dark/light/system) is an individual user preference (client-side)
 */
export interface ThemeSettings {
  theme_set: string;
}

/** Drizzle row → public (snake_case) SystemSettings shape. */
type SystemSettingsRow = typeof systemSettings.$inferSelect;

@Injectable()
export class SystemSettingsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private getDefaultSettings(): SystemSettings {
    return {
      id: true,
      allow_multiple_projects: true,
      allow_multiple_teams: true,
      theme_set: 'corporate',
      extended_settings: {},
    };
  }

  /** Map a Drizzle (camelCase) row to the public snake_case interface. */
  private toSystemSettings(row: SystemSettingsRow): SystemSettings {
    return {
      id: row.id,
      allow_multiple_projects: row.allowMultipleProjects ?? true,
      allow_multiple_teams: row.allowMultipleTeams ?? true,
      theme_set: row.themeSet ?? 'corporate',
      extended_settings: (row.extendedSettings ?? {}) as Record<
        string,
        unknown
      >,
      created_at: row.createdAt ?? undefined,
      updated_at: row.updatedAt ?? undefined,
    };
  }

  async getSettings(): Promise<SystemSettings> {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .limit(1);

    // If no settings found (shouldn't happen if initialized correctly), return defaults
    if (!row) {
      return this.getDefaultSettings();
    }

    return this.toSystemSettings(row);
  }

  /**
   * Get theme settings only (public endpoint - no auth required)
   * Used by Next.js in SSR to load theme on boot
   * NOTE: Only theme_set is returned. Mode is client-side only.
   */
  async getThemeSettings(): Promise<ThemeSettings> {
    const [row] = await this.db
      .select({ themeSet: systemSettings.themeSet })
      .from(systemSettings)
      .limit(1);

    // Fallback to defaults if not found
    if (!row) {
      return { theme_set: 'corporate' };
    }

    return {
      theme_set: row.themeSet ?? 'corporate',
    };
  }

  /**
   * Get default onboarding categories (public - no auth required)
   * Returns the configurable default categories from extended_settings
   */
  async getDefaultCategories(): Promise<
    Array<{ name: string; color: string; icon: string }>
  > {
    const settings = await this.getSettings();
    const defaults = (settings.extended_settings as any)?.default_categories;
    if (Array.isArray(defaults) && defaults.length > 0) {
      return defaults;
    }
    return [
      { name: 'Personal Life', color: '#EC4899', icon: 'Heart' },
      { name: 'Year Goals Tasks', color: '#F97316', icon: 'Target' },
      { name: 'Work', color: '#3B82F6', icon: 'Briefcase' },
      { name: 'Studies', color: '#8B5CF6', icon: 'BookOpen' },
    ];
  }

  async updateSettings(dto: UpdateSystemSettingsDto): Promise<SystemSettings> {
    // Map snake_case DTO keys → schema camelCase columns.
    const patch = {
      ...(dto.allow_multiple_projects !== undefined && {
        allowMultipleProjects: dto.allow_multiple_projects,
      }),
      ...(dto.allow_multiple_teams !== undefined && {
        allowMultipleTeams: dto.allow_multiple_teams,
      }),
      ...(dto.theme_set !== undefined && { themeSet: dto.theme_set }),
      ...(dto.extended_settings !== undefined && {
        extendedSettings: dto.extended_settings,
      }),
      updatedAt: new Date().toISOString(),
    };

    // Upsert with the fixed ID `true` to ensure we only ever have one row.
    const [row] = await this.db
      .insert(systemSettings)
      .values({ id: true, ...patch })
      .onConflictDoUpdate({ target: systemSettings.id, set: patch })
      .returning();

    if (!row) {
      throw new InternalServerErrorException(
        'Failed to update system settings',
      );
    }

    return this.toSystemSettings(row);
  }
}
