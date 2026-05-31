import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { subscriptions } from '../../db/schema';
import { AccessControlHelper } from '../../common/helpers/access-control.helper';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControlHelper: AccessControlHelper,
  ) {}

  async getSubscription(
    accountId: string,
    userId: string,
    _accessToken?: string,
  ) {
    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(
      null,
      accountId,
      userId,
    );

    const row = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.accountId, accountId),
      with: { plan: true },
    });

    // No rows returned (PostgREST PGRST116) — preserve the null contract.
    return row ?? null;
  }
}
