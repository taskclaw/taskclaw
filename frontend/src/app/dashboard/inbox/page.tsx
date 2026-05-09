'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  ArrowRight,
  AtSign,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Inbox as InboxIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInbox, type InboxItem, type InboxKind, type InboxSummary } from './actions';

const KIND_META: Record<
  InboxKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  orchestration_pending_approval: {
    label: 'Approval',
    icon: BellRing,
    tone: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
  },
  agent_approval_request: {
    label: 'Agent request',
    icon: AlertCircle,
    tone: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
  },
  dag_approval_pending: {
    label: 'Plan',
    icon: ClipboardList,
    tone: 'text-purple-600 bg-purple-500/10 border-purple-500/30',
  },
  mention_task_open: {
    label: 'Mention',
    icon: AtSign,
    tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30',
  },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function InboxPage() {
  const [data, setData] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | InboxKind>('all');

  async function refresh() {
    setRefreshing(true);
    try {
      const summary = await getInbox(100);
      setData(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.items;
    return data.items.filter((it) => it.kind === filter);
  }, [data, filter]);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <InboxIcon className="h-6 w-6" /> Inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything across the workspace that needs your attention. Approvals first, then agent
            requests, plan reviews, and open mention-spawned tasks.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Refresh
        </Button>
      </header>

      {/* Kind filter chips with counts */}
      {data && data.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={data.total}>
            All
          </FilterChip>
          {(Object.keys(KIND_META) as InboxKind[]).map((k) => {
            const count = data.by_kind[k];
            if (count === 0) return null;
            const meta = KIND_META[k];
            const Icon = meta.icon;
            return (
              <FilterChip
                key={k}
                active={filter === k}
                onClick={() => setFilter(k)}
                count={count}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </FilterChip>
            );
          })}
        </div>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : data && data.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="font-medium">Inbox zero</p>
              <p className="text-sm text-muted-foreground">
                Nothing needs your attention. The factory is humming.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <InboxRow key={item.id} item={item} />
          ))}
          {filtered.length === 0 && data && data.total > 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No items match this filter.
              </CardContent>
            </Card>
          )}
        </ul>
      )}
    </div>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const Wrapper = item.href ? Link : 'div';
  return (
    <li>
      <Wrapper
        href={item.href ?? '#'}
        className={cn(
          'group block rounded-lg border bg-card transition-colors hover:bg-accent/40',
          item.priority === 1 && 'border-amber-500/30',
        )}
      >
        <div className="flex items-start gap-3 p-3">
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs',
              meta.tone,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="truncate font-medium">{item.title}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {meta.label}
              </Badge>
              {item.pod_name && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.pod_name}
                </Badge>
              )}
              {item.priority === 1 && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px] text-white">
                  Action needed
                </Badge>
              )}
            </div>
            {item.subtitle && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              {relativeTime(item.created_at)}
            </p>
          </div>
          {item.href && (
            <ArrowRight className="mt-2 h-3 w-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </div>
      </Wrapper>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {children}
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px]',
          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}
