import {
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AccessControlHelper } from '../../common/helpers/access-control.helper';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly accessControlHelper: AccessControlHelper,
  ) {}

  async getSubscription(
    accountId: string,
    userId: string,
    accessToken?: string,
  ) {
    const supabase = this.supabaseService.getClient(accessToken);

    // Verify user belongs to account
    await this.accessControlHelper.verifyAccountAccess(
      supabase,
      accountId,
      userId,
    );

    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        `
                *,
                plan:plans(*)
            `,
      )
      .eq('account_id', accountId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }
}
