'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, FolderOpen, Loader2, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useSkillSearch,
  type AvailableSkill,
  type DiskSkill,
  type MarketSkill,
} from '@/hooks/use-skill-search';
import { importSkill } from '@/app/dashboard/skills-actions';

export interface SlashSelection {
  source: 'available' | 'local' | 'market';
  skill: { id: string; name: string; source_uri: string | null };
}

/**
 * Imperative handle exposed by SlashPalette so the parent textarea can
 * keep keyboard focus while still driving the palette. The textarea
 * forwards Enter / ArrowUp / ArrowDown into these methods.
 */
export interface SlashPaletteHandle {
  /** Move highlight up or down. Returns true if a real item received the highlight. */
  highlightDelta: (delta: 1 | -1) => boolean;
  /** Activate the currently highlighted item. Returns true if a selection happened. */
  activate: () => boolean;
}

interface SlashPaletteProps {
  open: boolean;
  query: string;
  onSelect: (selection: SlashSelection) => void;
  onClose: () => void;
}

type FlatItem =
  | { kind: 'available'; row: AvailableSkill }
  | { kind: 'local'; row: DiskSkill }
  | { kind: 'market'; row: MarketSkill };

/**
 * Passive popover above a chat input. The user keeps typing in the input;
 * `query` flows in from the parent. Up/Down/Enter come in via the
 * imperative handle so focus never jumps.
 */
export const SlashPalette = forwardRef<SlashPaletteHandle, SlashPaletteProps>(
  function SlashPalette({ open, query, onSelect, onClose }, ref) {
    const { data, loading, error } = useSkillSearch(query);
    const [importingUri, setImportingUri] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [highlightIdx, setHighlightIdx] = useState(0);

    // Build a flat ordered list so the highlight index has a single source of truth.
    const flat: FlatItem[] = useMemo(
      () => [
        ...data.available.map((row) => ({ kind: 'available' as const, row })),
        ...data.local.map((row) => ({ kind: 'local' as const, row })),
        ...data.market.map((row) => ({ kind: 'market' as const, row })),
      ],
      [data],
    );

    // Reset highlight when the result set changes.
    useEffect(() => {
      setHighlightIdx(0);
    }, [flat.length, query]);

    // Outside-click closes the palette.
    useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) {
        if (!containerRef.current) return;
        if (!containerRef.current.contains(e.target as Node)) onClose();
      }
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open, onClose]);

    // Keep the highlighted element scrolled into view.
    useEffect(() => {
      if (!open || flat.length === 0) return;
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-slash-idx="${highlightIdx}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    }, [open, highlightIdx, flat.length]);

    async function activateItem(item: FlatItem): Promise<boolean> {
      if (item.kind === 'available') {
        onSelect({
          source: 'available',
          skill: {
            id: item.row.id,
            name: item.row.name,
            source_uri: item.row.source_uri,
          },
        });
        return true;
      }
      if (item.kind === 'local') {
        setImportingUri(item.row.source_uri);
        try {
          const imported = await importSkill(item.row.source_uri, 'disk-scan');
          toast.success(`Imported ${imported.name}`);
          onSelect({
            source: 'local',
            skill: {
              id: imported.id,
              name: imported.name,
              source_uri: imported.source_uri ?? item.row.source_uri,
            },
          });
          return true;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Import failed');
          return false;
        } finally {
          setImportingUri(null);
        }
      }
      // market: deferred
      toast.info('Marketplace import lands in v1.1.');
      return false;
    }

    useImperativeHandle(
      ref,
      (): SlashPaletteHandle => ({
        highlightDelta: (delta) => {
          if (flat.length === 0) return false;
          setHighlightIdx((i) => {
            const next = (i + delta + flat.length) % flat.length;
            return next;
          });
          return true;
        },
        activate: () => {
          const item = flat[highlightIdx];
          if (!item) return false;
          void activateItem(item);
          return true;
        },
      }),
      [flat, highlightIdx],
    );

    if (!open) return null;

    let renderedIdx = -1;

    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-xl overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        role="listbox"
        aria-label="Skill suggestions"
      >
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>{query ? `Skills matching "${query}"` : 'Skills'}</span>
          </div>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">↑↓ Enter</kbd>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {error}
            </div>
          )}
          {!error && flat.length === 0 && !loading && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No skills match &quot;{query}&quot;.
            </p>
          )}

          {data.available.length > 0 && (
            <Section title="Available now">
              {data.available.map((row) => {
                renderedIdx += 1;
                const idx = renderedIdx;
                return (
                  <Row
                    key={`a-${row.id}`}
                    idx={idx}
                    highlight={idx === highlightIdx}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => activateItem({ kind: 'available', row })}
                    icon={<Sparkles className="h-3 w-3 text-primary" />}
                    title={row.name}
                    badge={
                      row.source_type !== 'custom' ? (
                        <Badge variant="outline" className="text-[10px]">
                          {row.source_type}
                        </Badge>
                      ) : undefined
                    }
                    description={row.description}
                  />
                );
              })}
            </Section>
          )}

          {data.local.length > 0 && (
            <Section title="On your machine">
              {data.local.map((row) => {
                renderedIdx += 1;
                const idx = renderedIdx;
                const importing = importingUri === row.source_uri;
                return (
                  <Row
                    key={`l-${row.id}`}
                    idx={idx}
                    highlight={idx === highlightIdx}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => activateItem({ kind: 'local', row })}
                    icon={<FolderOpen className="h-3 w-3 text-amber-500" />}
                    title={row.name}
                    badge={
                      <span className="text-[10px] text-muted-foreground">
                        {importing ? 'Importing…' : 'Click to import'}
                      </span>
                    }
                    description={row.description}
                    disabled={importing}
                  />
                );
              })}
            </Section>
          )}

          {data.market.length > 0 && (
            <Section title="Marketplace">
              {data.market.map((row) => {
                renderedIdx += 1;
                const idx = renderedIdx;
                return (
                  <Row
                    key={`m-${row.id}`}
                    idx={idx}
                    highlight={idx === highlightIdx}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => activateItem({ kind: 'market', row })}
                    icon={<Store className="h-3 w-3 text-muted-foreground" />}
                    title={row.name}
                    badge={
                      <Badge variant="outline" className="text-[10px]">
                        v1.1
                      </Badge>
                    }
                    description={row.description}
                  />
                );
              })}
            </Section>
          )}
        </div>
      </div>
    );
  },
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b last:border-b-0">
      <p className="bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}

function Row({
  idx,
  highlight,
  icon,
  title,
  badge,
  description,
  onClick,
  onMouseEnter,
  disabled,
}: {
  idx: number;
  highlight: boolean;
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  description: string | null;
  onClick: () => void;
  onMouseEnter: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-slash-idx={idx}
      role="option"
      aria-selected={highlight}
      onMouseEnter={onMouseEnter}
      // mousedown — fires before the document mousedown listener that closes
      // the palette would, so we don't lose the click to outside-detect.
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
        highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40',
        disabled && 'opacity-60',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          {badge}
        </span>
        {description && (
          <span className="line-clamp-2 text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}
