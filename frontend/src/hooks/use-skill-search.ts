'use client';

import { useEffect, useRef, useState } from 'react';
import { searchSkills, type SkillSearchResult } from '@/app/dashboard/skills-actions';

export type {
  SkillSearchResult,
  AvailableSkill,
  DiskSkill,
  MarketSkill,
} from '@/app/dashboard/skills-actions';

/**
 * Debounced skill search for the slash-command palette. Three groups:
 *   - available: skills already in the account, ready to attach.
 *   - local:     disk-scan rows the user can adopt with one click.
 *   - market:    deferred to v1.1.
 *
 * The hook intentionally avoids TanStack Query: the palette only renders
 * while the user is typing, and we want every keystroke (after debounce)
 * to hit the server for the freshest list — there is nothing to cache.
 */
export function useSkillSearch(
  prefix: string,
  opts: { include_local?: boolean; include_market?: boolean } = {},
) {
  const [data, setData] = useState<SkillSearchResult>({
    available: [],
    local: [],
    market: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastInflight = useRef(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const ticket = ++lastInflight.current;
      try {
        setLoading(true);
        const result = await searchSkills(prefix, opts);
        if (ticket !== lastInflight.current) return; // stale response
        setData(result);
        setError(null);
      } catch (err) {
        if (ticket !== lastInflight.current) return;
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (ticket === lastInflight.current) setLoading(false);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [prefix, opts.include_local, opts.include_market]);

  return { data, loading, error };
}
