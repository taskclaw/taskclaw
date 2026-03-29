import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { UpdateSystemSettingsDto } from './dto/update-settings.dto';

@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  /**
   * Public endpoint - no auth required
   * Returns only theme_set for SSR theme loading
   * NOTE: theme_mode has been removed - mode is now client-side only (localStorage)
   */
  @Get('theme')
  async getThemeSettings() {
    return this.systemSettingsService.getThemeSettings();
  }

  /**
   * Public endpoint - no auth required
   * Returns default categories for onboarding (configurable by super admin)
   */
  @Get('default-categories')
  async getDefaultCategories() {
    return this.systemSettingsService.getDefaultCategories();
  }

  @Get()
  @UseGuards(AuthGuard)
  async getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Patch()
  @UseGuards(AuthGuard)
  async updateSettings(@Body() dto: UpdateSystemSettingsDto, @Req() req: any) {
    const user = req.user;
    const role = user.app_metadata?.role || 'member';

    if (role !== 'super_admin') {
      throw new UnauthorizedException(
        'Only super admins can update system settings',
      );
    }

    return this.systemSettingsService.updateSettings(dto);
  }
}
