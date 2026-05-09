'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getFactorySummary, listPodsForLabels, type FactorySummary } from './actions';

const RANGES: Array<{ label: string; days: number }> = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const POD_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function fmtUSD(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function FactoryDashboardPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<FactorySummary | null>(null);
  const [podLabels, setPodLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getFactorySummary(days), listPodsForLabels()])
      .then(([s, labels]) => {
        if (cancelled) return;
        setSummary(s);
        setPodLabels(labels);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load summary');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const podRows = useMemo(() => {
    if (!summary) return [];
    return summary.cost_by_pod
      .map((r) => ({
        ...r,
        label:
          r.pod_id === 'unassigned'
            ? 'Unassigned'
            : podLabels[r.pod_id] ?? r.pod_id.slice(0, 6),
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 8);
  }, [summary, podLabels]);

  const dayRows = useMemo(() => {
    if (!summary) return [];
    // Backfill missing days with 0 so the line chart doesn't lie about gaps.
    if (summary.cost_by_day.length === 0) return [];
    const known = new Map(summary.cost_by_day.map((r) => [r.day, r.cost_usd]));
    const out: Array<{ day: string; cost_usd: number }> = [];
    const end = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      out.push({ day: d, cost_usd: known.get(d) ?? 0 });
    }
    return out;
  }, [summary, days]);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Factory Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cost, throughput, and cache efficiency across your Pods. The control panel for an industrial AI process factory.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </header>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading || !summary ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total cost ({days}d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {fmtUSD(summary.total_cost_usd)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estimated — based on published per-token pricing.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AI calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {summary.total_calls.toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Across all pods, agents, and providers.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Prompt cache hit rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-semibold">
                    {fmtPct(summary.cache_hit_rate)}
                  </div>
                  {summary.cache_hit_rate > 0.5 && (
                    <Badge className="bg-green-600 hover:bg-green-600">good</Badge>
                  )}
                  {summary.cache_hit_rate > 0 && summary.cache_hit_rate <= 0.5 && (
                    <Badge variant="outline">room to grow</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  cache_read / (cache_read + input). Higher saves money on Anthropic.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cost over time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cost per day</CardTitle>
            </CardHeader>
            <CardContent>
              {dayRows.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dayRows}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtUSD(Number(v))} />
                    <Tooltip
                      formatter={(value: number) => [fmtUSD(Number(value)), 'Cost']}
                    />
                    <Line type="monotone" dataKey="cost_usd" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Cost by Pod */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cost by Pod</CardTitle>
            </CardHeader>
            <CardContent>
              {podRows.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, podRows.length * 36)}>
                  <BarChart data={podRows} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtUSD(Number(v))} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip
                      formatter={(value: number) => [fmtUSD(Number(value)), 'Cost']}
                    />
                    <Bar dataKey="cost_usd" radius={[0, 4, 4, 0]}>
                      {podRows.map((_, i) => (
                        <Cell key={i} fill={POD_COLORS[i % POD_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
      <p>No usage recorded yet.</p>
      <p className="mt-1 text-xs">Make a few AI calls and check back — the rollup runs every hour.</p>
    </div>
  );
}
