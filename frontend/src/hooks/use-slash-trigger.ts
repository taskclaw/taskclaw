'use client';

import { useCallback, useMemo, type RefObject } from 'react';

export interface SlashTrigger {
  /** Whether the palette should be open right now. */
  open: boolean;
  /** Query string after the active `/`, used to drive the palette search. */
  query: string;
  /** Echoed back when the palette's input changes — rewrites the slash region only. */
  onQueryChange: (q: string) => void;
  /** Replace the active `/<query>` slice with the given chip text. */
  insertChip: (chip: string) => void;
  /** Close the palette: clears the active slash region (turns `foo /design` back into `foo `). */
  close: () => void;
}

/**
 * Mid-sentence `/` trigger detection.
 *
 * Opens the palette when the user has typed a `/` either at the start of the
 * input OR immediately after whitespace, AND the text after that `/` so far
 * contains no whitespace. So:
 *
 *   "/design"      → open, query="design"        ← classic at-start case
 *   "hello /design" → open, query="design"        ← mid-sentence
 *   "hello / "      → CLOSED (whitespace after `/` ends the trigger)
 *   "x/y"           → CLOSED (no whitespace before `/`, treated as path)
 *   "see [@me]/foo" → CLOSED (slash is inside an existing markdown link)
 *
 * `insertChip` replaces just the `/<query>` slice, leaving the surrounding
 * text intact. `close()` strips the slash region but keeps the prefix.
 *
 * The hook is purely string-math; the parent owns input state via `value`/`setValue`.
 */
export function useSlashTrigger(
  value: string,
  setValue: (v: string) => void,
  inputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
): SlashTrigger {
  const region = useMemo(() => detectSlashRegion(value), [value]);

  const open = region !== null;
  const query = region ? value.slice(region.start + 1, region.end) : '';

  const onQueryChange = useCallback(
    (q: string) => {
      // Replace the current slice between `/` and the slash region's end with
      // the new query. The user typing in the palette flows back through here.
      if (!region) {
        setValue('/' + q);
        return;
      }
      const before = value.slice(0, region.start + 1); // up to and including `/`
      const after = value.slice(region.end);
      setValue(before + q + after);
    },
    [region, setValue, value],
  );

  const insertChip = useCallback(
    (chip: string) => {
      if (!region) {
        setValue(chip);
      } else {
        const before = value.slice(0, region.start);
        const after = value.slice(region.end);
        setValue(before + chip + after);
      }
      // Re-focus the original input. requestAnimationFrame so the palette has
      // time to unmount and the caret lands at the right spot.
      requestAnimationFrame(() => inputRef?.current?.focus());
    },
    [region, setValue, value, inputRef],
  );

  const close = useCallback(() => {
    if (!region) return;
    const before = value.slice(0, region.start);
    const after = value.slice(region.end);
    setValue(before + after);
    requestAnimationFrame(() => inputRef?.current?.focus());
  }, [region, setValue, value, inputRef]);

  return { open, query, onQueryChange, insertChip, close };
}

/**
 * Find the active slash region [start, end) where:
 * - `start` is the index of `/`
 * - `end` is the index just past the last non-whitespace character of the query
 *   (which is also the input length when the trailing chars are non-space).
 *
 * Returns null when there's no active trigger.
 */
function detectSlashRegion(value: string): { start: number; end: number } | null {
  if (!value) return null;
  // Walk backwards from the end. The last `/` preceded by start-of-input or
  // whitespace, with no whitespace between it and our cursor, wins.
  for (let i = value.length - 1; i >= 0; i--) {
    const ch = value[i];
    if (/\s/.test(ch)) {
      // Whitespace means the active query window has ended without finding a `/`.
      return null;
    }
    if (ch === '/') {
      const prev = i > 0 ? value[i - 1] : '';
      // Must be at start or right after whitespace. `x/y` (no preceding space)
      // is NOT a slash trigger — it looks like a path.
      if (i === 0 || /\s/.test(prev)) {
        return { start: i, end: value.length };
      }
      // A `/` with non-space before it disqualifies this position; keep scanning
      // backwards in case there's an earlier slash that does qualify (rare).
      // For typical inputs the loop exits in 1–2 iterations.
      return null;
    }
  }
  return null;
}
