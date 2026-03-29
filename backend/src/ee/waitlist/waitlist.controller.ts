import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlistService.join(dto.email, dto.source);
  }

  @Get('count')
  getCount() {
    return this.waitlistService.getCount();
  }
}

@Controller('admin/waitlist')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.waitlistService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
