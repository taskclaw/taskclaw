import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
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

@Injectable()
export class SystemSettingsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private getDefaultSettings(): SystemSettings {
    return {
      id: true,
      allow_multiple_projects: true,
      allow_multiple_teams: true,
      theme_set: 'corporate',
      extended_settings: {},
    };
  }

  async getSettings(): Promise<SystemSettings> {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();

    if (error) {
      // If no settings found (shouldn't happen if initialized correctly), return defaults
      if (error.code === 'PGRST116') {
        return this.getDefaultSettings();
      }
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  /**
   * Get theme settings only (public endpoint - no auth required)
   * Used by Next.js in SSR to load theme on boot
   * NOTE: Only theme_set is returned. Mode is client-side only.
   */
  async getThemeSettings(): Promise<ThemeSettings> {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('system_settings')
      .select('theme_set')
      .single();

    if (error) {
      // Fallback to defaults if not found
      if (error.code === 'PGRST116') {
        return { theme_set: 'corporate' };
      }
      throw new InternalServerErrorException(error.message);
    }

    return {
      theme_set: data.theme_set ?? 'corporate',
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
    const supabase = this.supabaseService.getAdminClient();

    const updateData = {
      id: true,
      ...dto,
      updated_at: new Date().toISOString(),
    };

    // We use upsert with the fixed ID true to ensure we only have one row
    const { data, error } = await supabase
      .from('system_settings')
      .upsert(updateData)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }
}
