import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller()
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCallbackUrl(): string {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3003';
    return `${backendUrl}/integrations/oauth/callback`;
  }

  private getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3002';
  }

  /**
   * Start OAuth flow — returns redirect URL
   * GET /accounts/:accountId/integrations/oauth/:defId/authorize
   */
  @Get('accounts/:accountId/integrations/oauth/:defId/authorize')
  @UseGuards(AuthGuard)
  async authorize(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('defId') defId: string,
  ) {
    return this.oauthService.buildAuthorizeUrl(
      req.user.id,
      accountId,
      defId,
      this.getCallbackUrl(),
    );
  }

  /**
   * OAuth callback — no auth guard (redirected from provider)
   * GET /integrations/oauth/callback
   */
  @Get('integrations/oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      const frontendUrl = this.getFrontendUrl();
      return res.redirect(`${frontendUrl}/dashboard/settings/integrations?oauth_error=${error}`);
    }

    if (!code || !state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    const result = await this.oauthService.handleCallback(
      code,
      state,
      this.getCallbackUrl(),
    );

    const frontendUrl = this.getFrontendUrl();
    return res.redirect(
      `${frontendUrl}/dashboard/settings/integrations?connected=${result.definitionSlug}`,
    );
  }
}
