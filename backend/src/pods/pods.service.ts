import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { pods, boardInstances } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { CreatePodDto } from './dto/create-pod.dto';
import { UpdatePodDto } from './dto/update-pod.dto';

@Injectable()
export class PodsService {
  private readonly logger = new Logger(PodsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
  ) {}

  /**
   * Drizzle's relational query returns the joined row under the relation name
   * (`backboneConnection`); PostgREST returned it under the aliased embed name
   * (`backbone_connection`) with snake_case columns. Re-key and re-shape so the
   * response callers depend on is unchanged.
   */
  private present(row: any) {
    const { backboneConnection, ...rest } = row;
    return {
      ...rest,
      backbone_connection: backboneConnection
        ? {
            id: backboneConnection.id,
            name: backboneConnection.name,
            backbone_type: backboneConnection.backboneType,
            is_active: backboneConnection.isActive,
          }
        : null,
    };
  }

  async findAll(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const rows = await this.db.query.pods.findMany({
      where: eq(pods.accountId, accountId),
      orderBy: [asc(pods.position), desc(pods.createdAt)],
      with: {
        backboneConnection: {
          columns: {
            id: true,
            name: true,
            backboneType: true,
            isActive: true,
          },
        },
      },
    });

    const data = rows.map((r) => this.present(r));

    // Get board counts per pod
    const podIds = data.map((p) => p.id);
    if (podIds.length > 0) {
      const boardCounts = await this.db
        .select({ podId: boardInstances.podId })
        .from(boardInstances)
        .where(inArray(boardInstances.podId, podIds));

      const countMap: Record<string, number> = {};
      boardCounts.forEach((b) => {
        if (b.podId) {
          countMap[b.podId] = (countMap[b.podId] || 0) + 1;
        }
      });
      data.forEach((pod) => {
        pod.board_count = countMap[pod.id] || 0;
      });
    }

    return data;
  }

  async findOne(userId: string, accountId: string, podId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.pods.findFirst({
      where: and(eq(pods.id, podId), eq(pods.accountId, accountId)),
      with: {
        backboneConnection: {
          columns: {
            id: true,
            name: true,
            backboneType: true,
            isActive: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Pod with ID ${podId} not found`);
    }

    return this.present(row);
  }

  async findBySlug(userId: string, accountId: string, slug: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.pods.findFirst({
      where: and(eq(pods.slug, slug), eq(pods.accountId, accountId)),
      with: {
        backboneConnection: {
          columns: {
            id: true,
            name: true,
            backboneType: true,
            isActive: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Pod with slug "${slug}" not found`);
    }

    return this.present(row);
  }

  async create(userId: string, accountId: string, dto: CreatePodDto) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Auto-generate slug from name if not provided
    const slug =
      dto.slug ||
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    let data: typeof pods.$inferSelect;
    try {
      const [row] = await this.db
        .insert(pods)
        .values({
          accountId,
          name: dto.name,
          slug,
          description: dto.description || null,
          icon: dto.icon || 'layers',
          color: dto.color || '#6366f1',
          backboneConnectionId: dto.backbone_connection_id || null,
          agentConfig: dto.agent_config || {},
          position: dto.position ?? 0,
        })
        .returning();
      data = row;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          `A pod with slug "${slug}" already exists in this workspace`,
        );
      }
      throw new Error(`Failed to create pod: ${error?.message}`);
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
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify pod exists
    await this.findOne(userId, accountId, podId);

    const updateData: Partial<typeof pods.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.backbone_connection_id !== undefined)
      updateData.backboneConnectionId = dto.backbone_connection_id;
    if (dto.agent_config !== undefined) updateData.agentConfig = dto.agent_config;
    if (dto.position !== undefined) updateData.position = dto.position;
    if (dto.autonomy_level !== undefined)
      updateData.autonomyLevel = dto.autonomy_level;

    let data: typeof pods.$inferSelect;
    try {
      const [row] = await this.db
        .update(pods)
        .set(updateData)
        .where(and(eq(pods.id, podId), eq(pods.accountId, accountId)))
        .returning();
      data = row;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          `A pod with that slug already exists in this workspace`,
        );
      }
      throw new Error(`Failed to update pod: ${error?.message}`);
    }

    this.logger.log(`Pod updated: ${data.id}`);
    return data;
  }

  async delete(userId: string, accountId: string, podId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify pod exists
    await this.findOne(userId, accountId, podId);

    try {
      await this.db
        .delete(pods)
        .where(and(eq(pods.id, podId), eq(pods.accountId, accountId)));
    } catch (error: any) {
      throw new Error(`Failed to delete pod: ${error?.message}`);
    }

    this.logger.log(`Pod deleted: ${podId}`);
    return { success: true };
  }
}
