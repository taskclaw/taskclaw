import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BoardTemplatesService } from './board-templates.service';
import { InstallTemplateDto } from './dto/install-template.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { snakeKeys } from '../common/utils/snake-keys.util';

@ApiTags('Board Templates')
@Controller()
@UseGuards(AuthGuard)
export class BoardTemplatesController {
  constructor(private readonly boardTemplatesService: BoardTemplatesService) {}

  @Get('board-templates')
  findAll() {
    return this.boardTemplatesService.findAll();
  }

  @Get('board-templates/:id')
  // `findOne` is dual-use: `install()` reads its raw camelCase row internally,
  // so we re-key here at the HTTP boundary rather than in the service.
  async findOne(@Param('id') id: string) {
    return snakeKeys(await this.boardTemplatesService.findOne(id));
  }

  @Post('accounts/:accountId/boards/install')
  install(
    @Req() req,
    @Param('accountId') accountId: string,
    @Body() dto: InstallTemplateDto,
  ) {
    return this.boardTemplatesService.install(req.user.id, accountId, dto);
  }
}
