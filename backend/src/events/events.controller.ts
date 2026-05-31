import {
  Controller,
  Inject,
  MessageEvent,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Observable, from, interval, merge, switchMap, map } from 'rxjs';
import { AuthGuard } from '../common/guards/auth.guard';
import { DB, type Db } from '../db';
import { accountUsers } from '../db/schema';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /**
   * Server-Sent Events stream of {table,event,id,account_id} changes scoped to the
   * authenticated user's accounts. Reached via the Next.js BFF proxy (which attaches
   * the Bearer token from the httpOnly cookie). The client refetches on each event.
   */
  @UseGuards(AuthGuard)
  @Sse('stream')
  stream(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user.id as string;

    const accounts$ = from(
      this.db
        .select({ accountId: accountUsers.accountId })
        .from(accountUsers)
        .where(eq(accountUsers.userId, userId)),
    ).pipe(
      map((rows) => rows.map((r) => r.accountId).filter(Boolean) as string[]),
    );

    // 25s heartbeat keeps proxies/load-balancers from dropping the idle stream.
    const heartbeat$ = interval(25_000).pipe(
      map(() => ({ data: { type: 'ping' } }) as MessageEvent),
    );

    return accounts$.pipe(
      switchMap((accountIds) =>
        merge(
          this.events
            .streamForAccounts(accountIds)
            .pipe(map((e) => ({ data: e.data }) as MessageEvent)),
          heartbeat$,
        ),
      ),
    );
  }
}
