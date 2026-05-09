'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useSkillSearch, type AvailableSkill, type DiskSkill } from '@/hooks/use-skill-search';
import { importSkill } from '@/app/dashboard/skills-actions';

export interface SlashSelection {
  source: 'available' | 'local' | 'market';
  skill: { id: string; name: string; source_uri: string | null };
}

interface SlashPaletteProps {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (selection: SlashSelection) => void;
  onClose: () => void;
}

/**
 * Slash-command palette for skills (PRD §5).
 *
 * Visual grouping:
 *   1. Available now — skills already in the account.
 *   2. On your machine — disk-scan rows; one-click adoption inserts a chip.
 *   3. Marketplace — placeholder, surfaces in v1.1.
 *
 * Open the palette by passing open=true (typically when the user types '/'
 * at the start of a chat textarea). The palette OWNS its own input; the
 * parent passes the post-'/' query and the palette echoes back keystrokes
 * via onQueryChange.
 */
export function SlashPalette({
  open,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: SlashPaletteProps) {
  const { data, loading } = useSkillSearch(query);
  const [importing, setImporting] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Close on Escape (cmdk does it for the input, but the wrapping element
  // may eat the keypress in some chat surfaces, so we handle it here too).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleAvailable(skill: AvailableSkill) {
    onSelect({
      source: 'available',
      skill: { id: skill.id, name: skill.name, source_uri: skill.source_uri },
    });
  }

  async function handleLocal(skill: DiskSkill) {
    setImporting(skill.source_uri);
    try {
      const imported = await importSkill(skill.source_uri, 'disk-scan');
      toast.success(`Imported ${imported.name}`);
      onSelect({
        source: 'local',
        skill: { id: imported.id, name: imported.name, source_uri: imported.source_uri ?? skill.source_uri },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(null);
    }
  }

  const hasResults = useMemo(
    () => data.available.length > 0 || data.local.length > 0 || data.market.length > 0,
    [data],
  );

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-xl overflow-hidden rounded-lg border bg-popover shadow-lg"
    >
      <Command shouldFilter={false} className="[&_[cmdk-input]]:h-10">
        <CommandInput
          autoFocus
          value={query}
          onValueChange={onQueryChange}
          placeholder="Search skills…"
        />
        <CommandList className="max-h-72">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </div>
          )}
          {!loading && !hasResults && (
            <CommandEmpty>No skills match &quot;{query}&quot;.</CommandEmpty>
          )}

          {data.available.length > 0 && (
            <CommandGroup heading="Available now">
              {data.available.map((s) => (
                <CommandItem
                  key={`avail-${s.id}`}
                  value={`avail-${s.id}-${s.name}`}
                  onSelect={() => handleAvailable(s)}
                  className="flex flex-col items-start gap-1"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-3 w-3 text-primary" />
                      {s.name}
                    </span>
                    {s.source_type !== 'custom' && (
                      <Badge variant="outline" className="text-[10px]">
                        {s.source_type}
                      </Badge>
                    )}
                  </div>
                  {s.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data.local.length > 0 && (
            <CommandGroup heading="On your machine">
              {data.local.map((s) => (
                <CommandItem
                  key={`local-${s.id}`}
                  value={`local-${s.id}-${s.name}`}
                  onSelect={() => handleLocal(s)}
                  className="flex flex-col items-start gap-1"
                  disabled={importing === s.source_uri}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <FolderOpen className="h-3 w-3 text-amber-500" />
                      {s.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {importing === s.source_uri ? 'Importing…' : 'Click to import'}
                    </span>
                  </div>
                  {s.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data.market.length > 0 && (
            <CommandGroup heading="Marketplace">
              {data.market.map((s) => (
                <CommandItem
                  key={`market-${s.id}`}
                  value={`market-${s.id}-${s.name}`}
                  className="flex items-center gap-2"
                >
                  <Store className="h-3 w-3 text-muted-foreground" />
                  <span>{s.name}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    v1.1
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
