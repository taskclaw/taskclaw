'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export interface AgentAdvancedSectionProps {
  agentId: string;
  initialEnv: Record<string, string>;
  initialArgs: string[];
  onSave: (input: { custom_env?: Record<string, string>; custom_args?: string[] }) => Promise<unknown>;
}

interface EnvRow {
  id: string;
  key: string;
  /** The masked value as the server returned it (until the user edits). */
  maskedValue: string;
  /** The plaintext value entered by the user; null = unchanged. */
  newValue: string | null;
  show: boolean;
}

let _rid = 0;
const rid = () => `r${++_rid}`;

/**
 * Per-agent custom_env / custom_args editor (PRD §9).
 *
 * The server returns env values masked (•••• …last 4). Users see the mask
 * and can either:
 *   - leave a row alone (unchanged value is preserved server-side),
 *   - type a new value (overwrites on save),
 *   - empty out a value (deletes the key on save),
 *   - add a fresh row, or
 *   - remove a row entirely.
 *
 * Only rows with a non-null newValue are submitted, so users don't have to
 * re-supply secrets they haven't touched.
 */
export function AgentAdvancedSection({
  agentId,
  initialEnv,
  initialArgs,
  onSave,
}: AgentAdvancedSectionProps) {
  const [rows, setRows] = useState<EnvRow[]>(() => buildRows(initialEnv));
  const [args, setArgs] = useState<string>(initialArgs.join('\n'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Re-seed when navigating between agents.
    setRows(buildRows(initialEnv));
    setArgs(initialArgs.join('\n'));
  }, [agentId, JSON.stringify(initialEnv), JSON.stringify(initialArgs)]);

  const dirty = useMemo(() => {
    if (rows.some((r) => r.newValue !== null)) return true;
    if (rows.length !== Object.keys(initialEnv).length) return true;
    if (args !== initialArgs.join('\n')) return true;
    return false;
  }, [rows, args, initialEnv, initialArgs]);

  function update(id: string, patch: Partial<EnvRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const env: Record<string, string> = {};
      const seenKeys = new Set<string>();
      for (const r of rows) {
        const k = r.key.trim();
        if (!k) continue;
        if (seenKeys.has(k)) {
          throw new Error(`Duplicate key "${k}" — keys must be unique`);
        }
        seenKeys.add(k);
        if (r.newValue !== null) {
          env[k] = r.newValue;
        }
      }
      // Send removal markers (empty string) for any initial key the user removed.
      for (const k of Object.keys(initialEnv)) {
        if (!seenKeys.has(k)) env[k] = '';
      }

      const argList = args
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      await onSave({ custom_env: env, custom_args: argList });
      toast.success('Saved');
      // Mark all newValues as committed by re-pulling the masked view.
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          maskedValue: r.newValue !== null ? maskNewValue(r.newValue) : r.maskedValue,
          newValue: null,
          show: false,
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Per-agent environment</h3>
        <p className="text-xs text-muted-foreground">
          Override account-level backbone config for this agent only — useful for sending one
          agent through a separate API key, Bedrock-routed Anthropic, or a custom base URL.
          Values are encrypted at rest and masked here.
        </p>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No environment overrides. Click <em>Add variable</em> to define one.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto] gap-2">
            <Input
              value={r.key}
              onChange={(e) => update(r.id, { key: e.target.value })}
              placeholder="ANTHROPIC_API_KEY"
              className="font-mono text-xs"
            />
            <Input
              type={r.show ? 'text' : 'password'}
              value={r.newValue ?? r.maskedValue}
              placeholder={r.maskedValue || 'value'}
              onChange={(e) => update(r.id, { newValue: e.target.value })}
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => update(r.id, { show: !r.show })}
              title={r.show ? 'Hide' : 'Show'}
            >
              {r.show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: rid(), key: '', maskedValue: '', newValue: '', show: true },
            ])
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Add variable
        </Button>
      </div>

      <div>
        <Label htmlFor="agent-args">Custom CLI args / query params (one per line)</Label>
        <textarea
          id="agent-args"
          rows={4}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="--model-tier=premium"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary/40"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Adapter-specific. CLI backbones merge these as flags; HTTP backbones append as headers
          when prefixed with <code>X-</code>.
        </p>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Save environment
        </Button>
      </div>
    </div>
  );
}

function buildRows(env: Record<string, string>): EnvRow[] {
  return Object.entries(env).map(([k, v]) => ({
    id: rid(),
    key: k,
    maskedValue: v,
    newValue: null,
    show: false,
  }));
}

function maskNewValue(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 4) return '•'.repeat(plain.length);
  return '•'.repeat(Math.max(plain.length - 4, 4)) + plain.slice(-4);
}
