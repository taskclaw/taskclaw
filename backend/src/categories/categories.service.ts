import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll(userId: string, accountId: string, accessToken: string) {
    // Use admin client to bypass RLS
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    const { data, error} = await client
      .from('categories')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }

    return data;
  }

  async findOne(userId: string, accountId: string, id: string, accessToken: string) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }

    return data;
  }

  async create(
    userId: string,
    accountId: string,
    createCategoryDto: CreateCategoryDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    const { data, error } = await client
      .from('categories')
      .insert({
        account_id: accountId,
        ...createCategoryDto,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent: ${error.message}`);
    }

    return data;
  }

  async createBulk(
    userId: string,
    accountId: string,
    categories: CreateCategoryDto[],
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    const rows = categories.map((cat) => ({
      account_id: accountId,
      ...cat,
    }));

    // Use upsert with onConflict to handle duplicates gracefully
    const { data, error } = await client
      .from('categories')
      .upsert(rows, { onConflict: 'account_id,name', ignoreDuplicates: true })
      .select();

    if (error) {
      throw new Error(`Failed to create agents: ${error.message}`);
    }

    return data;
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    accessToken: string,
  ) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    // Verify category exists and belongs to account
    await this.findOne(userId, accountId, id, accessToken);

    const { data, error } = await client
      .from('categories')
      .update(updateCategoryDto)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update agent: ${error.message}`);
    }

    return data;
  }

  async remove(userId: string, accountId: string, id: string, accessToken: string) {
    const client = this.supabaseAdmin.getClient();

    // Verify user has access to this account
    await this.accessControl.verifyAccountAccess(
      client,
      accountId,
      userId,
    );

    // Verify category exists and belongs to account
    await this.findOne(userId, accountId, id, accessToken);

    const { error} = await client
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete agent: ${error.message}`);
    }

    return { message: 'Agent deleted successfully' };
  }
}
