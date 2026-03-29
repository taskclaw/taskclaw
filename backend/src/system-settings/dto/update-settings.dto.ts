import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
  IsObject,
} from 'class-validator';

// Allowed values for theme_set
export const VALID_THEME_SETS = [
  'corporate',
  'funky',
  'blue',
  'red',
  'ocean-blue',
  'ruby-red',
  'emerald-green',
  'amber-gold',
] as const;

export type ThemeSetValue = (typeof VALID_THEME_SETS)[number];

/**
 * DTO for updating system settings
 * NOTE: theme_mode has been removed - mode is now client-side only (localStorage)
 * Each user chooses their own mode (Light/Dark/System) locally
 */
export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsBoolean()
  allow_multiple_projects?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_multiple_teams?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(VALID_THEME_SETS)
  theme_set?: ThemeSetValue;

  @IsOptional()
  @IsObject()
  extended_settings?: Record<string, unknown>;
}
