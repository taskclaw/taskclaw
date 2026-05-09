import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodError } from 'zod';
import { AuthGuard } from '../common/guards/auth.guard';
import { SyncsService } from './syncs.service';

@ApiTags('Syncs')
@Controller('accounts/:accountId/syncs')
@UseGuards(AuthGuard)
export class SyncsController {
  constructor(private readonly syncs: SyncsService) {}

  private handleZod<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err) => {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: err.issues,
        });
      }
      throw err;
    });
  }

  @Get()
  list(
    @Request() req: any,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ) {
    return this.syncs.list(accountId);
  }

  @Get(':id')
  get(
    @Request() req: any,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.syncs.get(accountId, id);
  }

  @Get(':id/runs')
  listRuns(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncs.listRuns(accountId, id, limit ? Number(limit) : undefined);
  }

  /**
   * What this sync pulled in. Used by the Syncs UI to let users expand a
   * card and see exactly which skills were imported.
   */
  @Get(':id/skills')
  listSkills(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.syncs.listSkills(accountId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() body: unknown,
  ) {
    return this.handleZod(() => this.syncs.create(accountId, body));
  }

  @Patch(':id')
  update(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.handleZod(() => this.syncs.update(accountId, id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.syncs.remove(accountId, id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.syncs.runNow(accountId, id, 'manual');
  }
}
