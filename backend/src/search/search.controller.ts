import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { SearchService } from './search.service';

@Controller('admin/search')
@UseGuards(AuthGuard, AdminGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('q') query: string) {
    if (!query || query.length < 2) {
      return { users: [], accounts: [], projects: [] };
    }
    return this.searchService.searchGlobal(query);
  }
}
