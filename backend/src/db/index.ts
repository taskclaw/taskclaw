import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as tables from './schema';
import * as relations from './relations';

/**
 * Full schema namespace handed to drizzle — tables + relations merged so the
 * relational query API (`db.query.<table>.findMany({ with: {...} })`) resolves
 * the embedded selects that PostgREST expressed as `rel:rel!fk(...)`.
 */
const schema = { ...tables, ...relations };

/**
 * Injection token for the Drizzle database handle.
 *
 *   constructor(@Inject(DB) private readonly db: Db) {}
 *
 * `Db` is typed against the full schema so `db.query.<table>` is available once
 * the table + relations are declared in `schema.ts`.
 */
export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof schema>;

/** Separate token so we can close the pool on shutdown. */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Global Drizzle module. Mirrors `SupabaseModule` so the two run side-by-side
 * during the data-layer migration; each service cuts over from
 * `SupabaseAdminService` to `DB` independently. The Supabase clients are deleted
 * last (Epic 2, S2.6).
 *
 * A single shared `pg` Pool is used (one per process) — keep `max` modest against
 * the VPS Postgres `max_connections`.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('DATABASE_URL');
        if (!connectionString) {
          throw new Error('DATABASE_URL is not set — DrizzleModule cannot start');
        }
        return new Pool({
          connectionString,
          max: Number(config.get<string>('DB_POOL_MAX') ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
      },
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) =>
        drizzle(pool, {
          schema,
          logger: process.env.NODE_ENV !== 'production',
        }),
    },
  ],
  exports: [DB, PG_POOL],
})
export class DrizzleModule implements OnModuleDestroy {
  private readonly logger = new Logger(DrizzleModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('Postgres pool closed');
  }
}
