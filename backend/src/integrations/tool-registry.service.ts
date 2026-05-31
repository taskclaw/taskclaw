import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { integrationTools } from '../db/schema';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async findAll(accountId: string) {
    const data = await this.db
      .select()
      .from(integrationTools)
      .where(
        or(
          eq(integrationTools.accountId, accountId),
          isNull(integrationTools.accountId),
        ),
      )
      .orderBy(asc(integrationTools.name));

    return data;
  }

  async findOne(accountId: string, toolId: string) {
    const [data] = await this.db
      .select()
      .from(integrationTools)
      .where(
        and(
          eq(integrationTools.id, toolId),
          or(
            eq(integrationTools.accountId, accountId),
            isNull(integrationTools.accountId),
          ),
        ),
      )
      .limit(1);

    if (!data) {
      throw new Error(`Integration tool ${toolId} not found`);
    }

    return data;
  }

  async buildToolContext(
    accountId: string,
    requiredTools: string[],
  ): Promise<any[]> {
    if (!requiredTools.length) return [];

    const tools = await this.db
      .select()
      .from(integrationTools)
      .where(
        and(
          inArray(integrationTools.name, requiredTools),
          or(
            eq(integrationTools.accountId, accountId),
            isNull(integrationTools.accountId),
          ),
        ),
      );

    return (tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      endpoint: t.endpointTemplate,
      method: t.httpMethod,
      auth: t.authHeaderName
        ? {
            header: t.authHeaderName,
            credential_key: t.authCredentialKey,
          }
        : undefined,
      input_schema: t.requestBodySchema,
    }));
  }
}
