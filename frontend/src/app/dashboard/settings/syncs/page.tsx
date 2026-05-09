'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Github,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createSync,
  deleteSync,
  listSyncs,
  listSyncSkills,
  runSync,
  updateSync,
  type SyncRow,
  type CreateSyncInput,
  type SyncSkill,
} from './actions';

type SourceKind = SyncRow['source_kind'];
type SyncType = SyncRow['sync_type'];

const SOURCE_OPTIONS: Array<{
  value: SourceKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  available: boolean;
}> = [
  {
    value: 'local-folder',
    label: 'Local folder',
    icon: FolderOpen,
    description:
      'Scan a folder on the host running TaskClaw. Skills found in SKILL.md frontmatter are catalogued under "On your machine".',
    available: true,
  },
  {
    value: 'git-repo',
    label: 'GitHub repo',
    icon: Github,
    description: 'Clone a public or token-authorized repo and scan for SKILL.md files. (v1.1)',
    available: false,
  },
  {
    value: 'marketplace',
    label: 'Marketplace',
    icon: Store,
    description: 'Pull skills from the public Skill Marketplace. (v1.1)',
    available: false,
  },
];

function statusBadge(status: SyncRow['last_status']) {
  if (!status) return <Badge variant="outline">Never run</Badge>;
  if (status === 'ok') return <Badge className="bg-green-600 hover:bg-green-600">OK</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-600 hover:bg-amber-600">Partial</Badge>;
  if (status === 'running') return <Badge className="bg-blue-600 hover:bg-blue-600">Running</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function SyncsPage() {
  const [syncs, setSyncs] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  async function refresh() {
    try {
      setLoading(true);
      const rows = await listSyncs();
      setSyncs(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load syncs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onRun(id: string) {
    setRunningIds((s) => new Set(s).add(id));
    try {
      const run = await runSync(id);
      const summary = `Added ${run.items_added}, updated ${run.items_updated}, removed ${run.items_removed}`;
      if (run.status === 'ok') {
        toast.success(`Sync completed — ${summary}`);
      } else if (run.status === 'partial') {
        toast.warning(`Sync partial — ${summary}`);
      } else {
        toast.error(`Sync failed — ${run.log_excerpt ?? 'check logs'}`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunningIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function onToggleEnabled(row: SyncRow) {
    startTransition(async () => {
      try {
        await updateSync(row.id, { enabled: !row.enabled });
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Update failed');
      }
    });
  }

  async function onDelete(row: SyncRow) {
    if (!confirm(`Delete sync "${row.name}"? Imported skills will keep their last snapshot but stop auto-updating.`)) {
      return;
    }
    try {
      await deleteSync(row.id);
      toast.success('Sync removed');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header className="flex flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Syncs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull skills, knowledge and Pods into TaskClaw on a schedule. A Sync is read-only ingestion —
            it doesn&apos;t push state back out.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Sync
        </Button>
      </header>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : syncs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No Syncs yet</p>
              <p className="text-sm text-muted-foreground">
                Add a Skills Sync to scan your local Claude / Cursor / Copilot skills and bring them in.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add your first Sync
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {syncs.map((s) => (
            <li key={s.id}>
              <SyncCard
                sync={s}
                running={runningIds.has(s.id)}
                pending={pending}
                onRun={() => onRun(s.id)}
                onToggleEnabled={() => onToggleEnabled(s)}
                onDelete={() => onDelete(s)}
                lastRunIso={s.last_run_at}
              />
            </li>
          ))}
        </ul>
      )}

      <CreateSyncDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          await refresh();
        }}
      />
    </div>
  );
}

function summarizeConfig(s: SyncRow): string {
  const cfg = s.config as Record<string, unknown>;
  if (s.source_kind === 'local-folder') {
    const paths = Array.isArray(cfg.paths) ? (cfg.paths as string[]) : [];
    return paths.length ? paths.join(', ') : '(no paths configured)';
  }
  if (s.source_kind === 'git-repo') {
    return typeof cfg.repo_url === 'string' ? cfg.repo_url : '(no repo)';
  }
  return JSON.stringify(cfg);
}

/**
 * SyncCard — one row in the Syncs list, with an expandable "Imported skills"
 * section so users can see exactly what the sync pulled in. Skills are
 * lazy-loaded the first time the user opens the section, then re-fetched
 * after every successful "Sync now" so the count stays fresh.
 */
function SyncCard({
  sync,
  running,
  pending,
  onRun,
  onToggleEnabled,
  onDelete,
  lastRunIso,
}: {
  sync: SyncRow;
  running: boolean;
  pending: boolean;
  onRun: () => Promise<void> | void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  lastRunIso: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [skills, setSkills] = useState<SyncSkill[] | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    setLoadingSkills(true);
    setSkillsError(null);
    try {
      const rows = await listSyncSkills(sync.id);
      setSkills(rows);
    } catch (err) {
      setSkillsError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoadingSkills(false);
    }
  }, [sync.id]);

  // Lazy-load on first expand
  useEffect(() => {
    if (expanded && skills === null) {
      void loadSkills();
    }
  }, [expanded, skills, loadSkills]);

  // Re-fetch after a successful run (last_run_at changes)
  useEffect(() => {
    if (expanded && skills !== null) {
      void loadSkills();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunIso]);

  async function handleRun() {
    await onRun();
    // If the section is open, refresh after the run finishes.
    if (expanded) await loadSkills();
  }

  const itemCount = skills?.length ?? null;
  const missingFromDisk = skills?.filter((s) => s.locally_available === false).length ?? 0;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="-ml-1 rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                title={expanded ? 'Hide imported skills' : 'Show imported skills'}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              <span className="font-medium">{sync.name}</span>
              <Badge variant="outline">{sync.sync_type}</Badge>
              <Badge variant="outline">{sync.source_kind}</Badge>
              {statusBadge(sync.last_status)}
              {!sync.enabled && <Badge variant="outline">Paused</Badge>}
              {itemCount !== null && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {itemCount} item{itemCount === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <p className="break-all text-xs text-muted-foreground">{summarizeConfig(sync)}</p>
            <p className="text-xs text-muted-foreground">
              Last run: {relativeTime(sync.last_run_at)}
              {sync.schedule_cron ? ` · Schedule: ${sync.schedule_cron}` : ' · Manual only'}
            </p>
            {sync.last_error && <p className="text-xs text-destructive">{sync.last_error}</p>}
          </div>
          <div className="flex shrink-0 flex-row gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleRun}
              disabled={running || !sync.enabled}
            >
              {running ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Sync now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleEnabled}
              disabled={pending}
            >
              {sync.enabled ? (
                <>
                  <Pause className="mr-1 h-3 w-3" /> Pause
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3 w-3" /> Resume
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Imported {sync.sync_type}{' '}
                {missingFromDisk > 0 && (
                  <span className="ml-2 text-amber-600 normal-case font-normal">
                    ({missingFromDisk} no longer on disk)
                  </span>
                )}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => void loadSkills()}
                disabled={loadingSkills}
              >
                {loadingSkills ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </div>
            {skillsError && (
              <p className="text-xs text-destructive">{skillsError}</p>
            )}
            {!skillsError && loadingSkills && skills === null && (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            )}
            {!skillsError && skills !== null && skills.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">
                Nothing imported yet. Run the sync to scan the source.
              </p>
            )}
            {!skillsError && skills !== null && skills.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
                {skills.map((sk) => (
                  <li
                    key={sk.id}
                    className="flex items-baseline justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-foreground">{sk.name}</span>
                        {sk.source_version && (
                          <Badge variant="outline" className="text-[10px]">
                            v{sk.source_version}
                          </Badge>
                        )}
                        {sk.locally_available === false && (
                          <Badge variant="outline" className="text-[10px] text-amber-600">
                            removed
                          </Badge>
                        )}
                      </div>
                      {sk.description && (
                        <p className="line-clamp-1 text-muted-foreground">
                          {sk.description}
                        </p>
                      )}
                    </div>
                    {sk.source_uri && (
                      <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground/70">
                        {sk.source_uri.replace(/^file:\/\//, '')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSyncDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('Local Skills Folder');
  const [syncType, setSyncType] = useState<SyncType>('skills');
  const [sourceKind, setSourceKind] = useState<SourceKind>('local-folder');
  const [paths, setPaths] = useState(
    [
      '/host-skills/skills',
      '~/.claude/skills',
      '~/.cursor/skills',
      '~/.copilot/skills',
      '~/.config/opencode/skills',
    ].join('\n'),
  );
  const [repoUrl, setRepoUrl] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setName('Local Skills Folder');
      setSyncType('skills');
      setSourceKind('local-folder');
    }
  }, [open]);

  const sourceOption = SOURCE_OPTIONS.find((o) => o.value === sourceKind);

  async function submit() {
    setSubmitting(true);
    try {
      const config: Record<string, unknown> = {};
      if (sourceKind === 'local-folder') {
        const cleaned = paths
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (cleaned.length === 0) {
          toast.error('Add at least one path');
          return;
        }
        config.paths = cleaned;
      } else if (sourceKind === 'git-repo') {
        if (!repoUrl) {
          toast.error('Repo URL is required');
          return;
        }
        config.repo_url = repoUrl;
      }

      const input: CreateSyncInput = {
        name,
        sync_type: syncType,
        source_kind: sourceKind,
        config,
        schedule_cron: scheduleCron.trim() || null,
        enabled: true,
      };
      await createSync(input);
      toast.success('Sync created');
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Sync</DialogTitle>
          <DialogDescription>
            Pull content into TaskClaw on a schedule. The sync is read-only and won&apos;t modify the
            source.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sync-name">Name</Label>
            <Input id="sync-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={syncType} onValueChange={(v) => setSyncType(v as SyncType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skills">Skills</SelectItem>
                  <SelectItem value="knowledge" disabled>
                    Knowledge (v1.1)
                  </SelectItem>
                  <SelectItem value="pods" disabled>
                    Pods (v1.1)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={sourceKind}
                onValueChange={(v) => setSourceKind(v as SourceKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} disabled={!opt.available}>
                      {opt.label}
                      {!opt.available && ' (v1.1)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sourceOption && (
            <p className="text-xs text-muted-foreground">{sourceOption.description}</p>
          )}

          {sourceKind === 'local-folder' && (
            <div className="space-y-2">
              <Label htmlFor="sync-paths">Folders to scan (one per line)</Label>
              <Textarea
                id="sync-paths"
                rows={5}
                value={paths}
                onChange={(e) => setPaths(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                If TaskClaw runs in Docker, the host folders must be mounted into the container.
                Set <code>SKILLS_HOST_DIR</code> in your shell to expose <code>~/.claude</code> at
                <code> /host-skills</code> inside the backend.
              </p>
            </div>
          )}

          {sourceKind === 'git-repo' && (
            <div className="space-y-2">
              <Label htmlFor="sync-repo">Repository URL</Label>
              <Input
                id="sync-repo"
                placeholder="https://github.com/your/skills"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sync-cron">Schedule (cron, optional)</Label>
            <Input
              id="sync-cron"
              placeholder="e.g. 0 2 * * *  (daily at 02:00) or */15 * * * *"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to keep the sync manual-only.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
