import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiProviderService } from './ai-provider.service';
import { CreateAiProviderDto } from './dto/create-ai-provider.dto';
import { UpdateAiProviderDto } from './dto/update-ai-provider.dto';
import { VerifyConnectionDto } from './dto/verify-connection.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('AI Provider')
@Controller('accounts/:accountId/ai-provider')
@UseGuards(AuthGuard)
export class AiProviderController {
  constructor(private readonly aiProviderService: AiProviderService) {}

  /**
   * GET /accounts/:accountId/ai-provider
   * Get AI provider config (with masked API key)
   */
  @Get()
  findOne(@Req() req, @Param('accountId') accountId: string) {
    return this.aiProviderService.findOne(
      req.user.id,
      accountId,
      req.accessToken,
    );
  }

  /**
   * POST /accounts/:accountId/ai-provider
   * Create or update AI provider config
   */
  @Post()
  upsert(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() createAiProviderDto: CreateAiProviderDto,
  ) {
    return this.aiProviderService.upsert(
      req.user.id,
      accountId,
      createAiProviderDto,
      req.accessToken,
    );
  }

  /**
   * PATCH /accounts/:accountId/ai-provider
   * Update existing AI provider config
   */
  @Patch()
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() updateAiProviderDto: UpdateAiProviderDto,
  ) {
    return this.aiProviderService.update(
      req.user.id,
      accountId,
      updateAiProviderDto,
      req.accessToken,
    );
  }

  /**
   * DELETE /accounts/:accountId/ai-provider
   * Remove AI provider config
   */
  @Delete()
  remove(@Req() req, @Param('accountId') accountId: string) {
    return this.aiProviderService.remove(
      req.user.id,
      accountId,
      req.accessToken,
    );
  }

  /**
   * POST /accounts/:accountId/ai-provider/verify
   * Verify connection to OpenClaw instance
   */
  @Post('verify')
  verifyConnection(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() verifyConnectionDto: VerifyConnectionDto,
  ) {
    return this.aiProviderService.verifyConnection(
      req.user.id,
      accountId,
      verifyConnectionDto,
      req.accessToken,
    );
  }
}
