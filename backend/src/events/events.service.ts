import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { Observable, Subject, filter, map } from 'rxjs';

export interface TaskclawEvent {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
  account_id: string | null;
}

const CHANNEL = 'taskclaw_events';

/**
 * Realtime events (Epic 4) — replaces Supabase Realtime.
 *
 * Holds ONE dedicated pg connection doing `LISTEN taskclaw_events`. DB triggers
 * (0003_realtime_triggers.sql) NOTIFY a lightweight {table,event,id,account_id}
 * payload on every change to tasks / orchestrated_tasks. Consumers get an Observable
 * filtered to the accounts they're allowed to see; the SSE controller turns it into
 * a per-request stream. Auto-reconnects if the listener connection drops.
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private client: Client | null = null;
  private readonly subject = new Subject<TaskclawEvent>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.destroyed) return;
    try {
      const client = new Client({
        connectionString: this.config.get<string>('DATABASE_URL'),
      });
      client.on('error', (err) => {
        this.logger.warn(`LISTEN connection error: ${err.message}`);
        this.scheduleReconnect();
      });
      client.on('notification', (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        try {
          this.subject.next(JSON.parse(msg.payload) as TaskclawEvent);
        } catch {
          /* ignore malformed payloads */
        }
      });
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
      this.logger.log(`Listening on '${CHANNEL}'`);
    } catch (e: any) {
      this.logger.warn(`Failed to start LISTEN: ${e?.message ?? e}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.client = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 2000);
  }

  /** Stream of events scoped to the given account ids, as SSE MessageEvents. */
  streamForAccounts(accountIds: string[]): Observable<{ data: TaskclawEvent }> {
    const allowed = new Set(accountIds);
    return this.subject.pipe(
      filter((e) => !e.account_id || allowed.has(e.account_id)),
      map((e) => ({ data: e })),
    );
  }
}
