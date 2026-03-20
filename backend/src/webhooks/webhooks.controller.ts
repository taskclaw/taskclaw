import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { AuthGuard } from '../common/guards/auth.guard';

@ApiTags('Webhooks')
@Controller('accounts/:accountId/webhooks')
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks' })
  findAll(@Req() req, @Param('accountId') accountId: string) {
    return this.webhooksService.findAll(accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook' })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() body: { url: string; secret: string; events: string[]; active?: boolean },
  ) {
    return this.webhooksService.create(accountId, body);
  }

  @Patch(':webhookId')
  @ApiOperation({ summary: 'Update a webhook' })
  update(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('webhookId') webhookId: string,
    @Body() body: { url?: string; secret?: string; events?: string[]; active?: boolean },
  ) {
    return this.webhooksService.update(accountId, webhookId, body);
  }

  @Delete(':webhookId')
  @ApiOperation({ summary: 'Delete a webhook' })
  @HttpCode(HttpStatus.OK)
  remove(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.remove(accountId, webhookId);
  }

  @Get(':webhookId/deliveries')
  @ApiOperation({ summary: 'View webhook delivery history' })
  getDeliveries(
    @Req() req,
    @Param('accountId') accountId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhooksService.getDeliveries(accountId, webhookId);
  }
}
