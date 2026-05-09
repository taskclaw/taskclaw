'use client';

import {
  cloneElement,
  isValidElement,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { SlashPalette, type SlashPaletteHandle, type SlashSelection } from './slash-palette';
import { useSlashTrigger } from '@/hooks/use-slash-trigger';

interface SkillPaletteHostProps {
  /** Current input value (controlled by the parent). */
  value: string;
  /** Setter the host calls when the slash region needs to change. */
  setValue: (v: string) => void;
  /** The actual `<input>` or `<textarea>`. Must accept ref + onKeyDown. */
  children: ReactElement<{
    ref?: RefObject<any>;
    onKeyDown?: (e: KeyboardEvent<any>) => void;
  }>;
  /**
   * Called when the parent's onKeyDown fires AND the palette is closed.
   * Lets the surface keep its own send-on-Enter / Cmd+Enter / Escape rules
   * without us guessing them.
   */
  onInputKeyDown?: (e: KeyboardEvent<any>) => void;
  /**
   * Optional outer ref that the parent uses for `.focus()` calls (auto-focus
   * on mount, focus-back-after-clipboard, etc.). The host attaches it to
   * the underlying input alongside its own internal ref.
   */
  externalRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Custom chip text (default: `[/SkillName] `). */
  chipFor?: (sel: SlashSelection) => string;
  /** Where the palette anchors. Default 'top' = popover above the input. */
  anchor?: 'top' | 'bottom';
  /** Optional class on the wrapper div. */
  className?: string;
}

/**
 * Drop-in wrapper that adds the slash-command palette to any chat input.
 * Centralizes the bits every surface used to repeat:
 *   - mid-sentence slash detection (`useSlashTrigger`)
 *   - imperative ref to forward Up/Down/Enter into the popover
 *   - chip insertion that replaces only the `/query` slice
 *   - swallow Enter/Escape while the palette is open so the surface's
 *     own send-key doesn't fire
 *
 * Usage:
 *
 *   <SkillPaletteHost value={input} setValue={setInput}>
 *     <textarea
 *       value={input}
 *       onChange={e => setInput(e.target.value)}
 *       // onKeyDown is auto-augmented by the host
 *     />
 *   </SkillPaletteHost>
 *
 * The host owns the wrapper element (it needs `position: relative` so the
 * popover positions correctly) and clones the input to inject ref +
 * onKeyDown without cluttering the call sites.
 */
export function SkillPaletteHost({
  value,
  setValue,
  children,
  onInputKeyDown,
  externalRef,
  chipFor,
  anchor = 'top',
  className,
}: SkillPaletteHostProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const paletteRef = useRef<SlashPaletteHandle | null>(null);
  const slash = useSlashTrigger(value, setValue, inputRef as any);

  // Combined ref: host's internal ref (for slash insert focus) + the
  // parent's externalRef (for surfaces that auto-focus on mount).
  const setBothRefs = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRef.current = el;
    if (externalRef) {
      (externalRef as any).current = el;
    }
  };

  const onSelect = (sel: SlashSelection) => {
    const chip = chipFor ? chipFor(sel) : `[/${sel.skill.name}] `;
    slash.insertChip(chip);
  };

  const handleKeyDown = (e: KeyboardEvent<any>) => {
    if (slash.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteRef.current?.highlightDelta(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteRef.current?.highlightDelta(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        paletteRef.current?.activate();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        slash.close();
        return;
      }
      // Other keys flow through to onChange via the textarea normally.
      return;
    }
    onInputKeyDown?.(e);
  };

  if (!isValidElement(children)) {
    throw new Error('SkillPaletteHost: children must be a single input/textarea element');
  }

  const augmented = cloneElement(children, {
    ref: setBothRefs as any,
    onKeyDown: handleKeyDown,
  } as any);

  return (
    <div className={`relative ${className ?? ''}`}>
      <SlashPalette
        ref={paletteRef}
        open={slash.open}
        query={slash.query}
        onQueryChange={slash.onQueryChange}
        onSelect={onSelect}
        onClose={slash.close}
        anchor={anchor}
      />
      {augmented}
    </div>
  );
}
