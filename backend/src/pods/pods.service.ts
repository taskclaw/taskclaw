import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreatePodDto } from './dto/create-pod.dto';
import { UpdatePodDto } from './dto/update-pod.dto';

@Injectable()
export class PodsService {
  private readonly logger = new Logger(PodsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly accessControl: AccessControlHelper,
  ) {}

  async findAll(userId: string, accountId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('pods')
      .select(
        '*, backbone_connection:backbone_connections!backbone_connection_id(id, name, backbone_type, is_active)',
      )
      .eq('account_id', accountId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pods: ${error.message}`);
    }

    // Get board counts per pod
    const podIds = data.map((p) => p.id);
    if (podIds.length > 0) {
      const { data: boardCounts, error: countError } = await client
        .from('board_instances')
        .select('pod_id')
        .in('pod_id', podIds);

      if (!countError && boardCounts) {
        const countMap: Record<string, number> = {};
        boardCounts.forEach((b) => {
          if (b.pod_id) {
            countMap[b.pod_id] = (countMap[b.pod_id] || 0) + 1;
          }
        });
        data.forEach((pod) => {
          pod.board_count = countMap[pod.id] || 0;
        });
      }
    }

    return data;
  }

  async findOne(userId: string, accountId: string, podId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('pods')
      .select(
        '*, backbone_connection:backbone_connections!backbone_connection_id(id, name, backbone_type, is_active)',
      )
      .eq('id', podId)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Pod with ID ${podId} not found`);
    }

    return data;
  }

  async findBySlug(userId: string, accountId: string, slug: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    const { data, error } = await client
      .from('pods')
      .select(
        '*, backbone_connection:backbone_connections!backbone_connection_id(id, name, backbone_type, is_active)',
      )
      .eq('slug', slug)
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Pod with slug "${slug}" not found`);
    }

    return data;
  }

  async create(userId: string, accountId: string, dto: CreatePodDto) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Auto-generate slug from name if not provided
    const slug =
      dto.slug ||
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const { data, error } = await client
      .from('pods')
      .insert({
        account_id: accountId,
        name: dto.name,
        slug,
        description: dto.description || null,
        icon: dto.icon || 'layers',
        color: dto.color || '#6366f1',
        backbone_connection_id: dto.backbone_connection_id || null,
        agent_config: dto.agent_config || {},
        position: dto.position ?? 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          `A pod with slug "${slug}" already exists in this workspace`,
        );
      }
      throw new Error(`Failed to create pod: ${error.message}`);
    }

    this.logger.log(`Pod created: ${data.id} (${data.slug})`);
    return data;
  }

  async update(
    userId: string,
    accountId: string,
    podId: string,
    dto: UpdatePodDto,
  ) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify pod exists
    await this.findOne(userId, accountId, podId);

    const updateData: any = { updated_at: new Date().toISOString() };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.backbone_connection_id !== undefined)
      updateData.backbone_connection_id = dto.backbone_connection_id;
    if (dto.agent_config !== undefined) updateData.agent_config = dto.agent_config;
    if (dto.position !== undefined) updateData.position = dto.position;
    if (dto.autonomy_level !== undefined) updateData.autonomy_level = dto.autonomy_level;

    const { data, error } = await client
      .from('pods')
      .update(updateData)
      .eq('id', podId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          `A pod with that slug already exists in this workspace`,
        );
      }
      throw new Error(`Failed to update pod: ${error.message}`);
    }

    this.logger.log(`Pod updated: ${data.id}`);
    return data;
  }

  async delete(userId: string, accountId: string, podId: string) {
    const client = this.supabaseAdmin.getClient();
    await this.accessControl.verifyAccountAccess(client, accountId, userId);

    // Verify pod exists
    await this.findOne(userId, accountId, podId);

    const { error } = await client
      .from('pods')
      .delete()
      .eq('id', podId)
      .eq('account_id', accountId);

    if (error) {
      throw new Error(`Failed to delete pod: ${error.message}`);
    }

    this.logger.log(`Pod deleted: ${podId}`);
    return { success: true };
  }
}
