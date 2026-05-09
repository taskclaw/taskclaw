import { Injectable } from '@nestjs/common';

export type MentionKind = 'user' | 'agent' | 'task';

export interface ExpandedMention {
  kind: MentionKind;
  /** Resolved entity ID. */
  id: string;
  /** Display name as it appeared in the source text. */
  display: string;
  /** Character offset in the original (un-expanded) text. */
  offset: number;
}

export interface ExpandResult {
  /** Source text rewritten with markdown links of the form [@X](mention://kind/uuid). */
  expanded: string;
  /** All recognized mentions, in order. */
  mentions: ExpandedMention[];
}

export interface MentionContext {
  /** Map of @PersonName (case-insensitive) → user uuid. */
  users: Map<string, string>;
  /** Map of @AgentName (case-insensitive) → agent uuid. */
  agents: Map<string, string>;
  /** Map of T-1234 → task uuid. */
  tasks: Map<string, string>;
}

/**
 * Mention expansion (PRD §7.1, §7.4).
 *
 * Recognizes:
 *   - @PersonName / @AgentName    → mention://user/<uuid> | mention://agent/<uuid>
 *   - T-1234 task references       → mention://task/<uuid>
 *
 * Skip regions (where mentions are NOT expanded, to avoid mangling):
 *   - Fenced code blocks (```...```)
 *   - Inline code spans (`...`)
 *   - Existing markdown links — both [text](url) and bare <url>
 *   - Already-expanded mention://... links
 *
 * Pure function: zero I/O, no side effects. The dispatcher consumes this
 * output and decides what to do with each kind.
 */
@Injectable()
export class MentionExpandService {
  expand(source: string, ctx: MentionContext): ExpandResult {
    if (!source) return { expanded: '', mentions: [] };

    const skipRanges = this.computeSkipRanges(source);
    const mentions: ExpandedMention[] = [];
    const out: string[] = [];

    let cursor = 0;
    while (cursor < source.length) {
      const segment = this.nextMatch(source, cursor, skipRanges);
      if (!segment) {
        out.push(source.slice(cursor));
        break;
      }
      // Emit any text before the match unchanged.
      if (segment.start > cursor) out.push(source.slice(cursor, segment.start));
      const replacement = this.resolve(segment.match, segment.kind, ctx);
      if (replacement) {
        out.push(replacement.markdown);
        mentions.push({
          kind: replacement.kind,
          id: replacement.id,
          display: replacement.display,
          offset: segment.start,
        });
      } else {
        out.push(source.slice(segment.start, segment.end));
      }
      cursor = segment.end;
    }

    return { expanded: out.join(''), mentions };
  }

  // ------------------------------------------------------------
  // Skip range computation
  // ------------------------------------------------------------

  private computeSkipRanges(source: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];

    // Fenced code blocks: ```...```
    const fenceRe = /```[\s\S]*?```/g;
    for (const m of source.matchAll(fenceRe)) {
      if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
    }

    // Inline code spans: `...`
    const inlineRe = /`[^`\n]*`/g;
    for (const m of source.matchAll(inlineRe)) {
      if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
    }

    // Existing markdown links: [text](url)
    const linkRe = /\[[^\]]*\]\([^)]*\)/g;
    for (const m of source.matchAll(linkRe)) {
      if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
    }

    // Bare angle-bracket URLs: <https://...>
    const angleRe = /<[a-z]+:\/\/[^>\s]+>/gi;
    for (const m of source.matchAll(angleRe)) {
      if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
    }

    return ranges.sort((a, b) => a[0] - b[0]);
  }

  private inSkip(offset: number, skipRanges: Array<[number, number]>): boolean {
    for (const [a, b] of skipRanges) {
      if (offset >= a && offset < b) return true;
      if (a > offset) break; // ranges are sorted
    }
    return false;
  }

  // ------------------------------------------------------------
  // Match finding
  // ------------------------------------------------------------

  private nextMatch(
    source: string,
    from: number,
    skipRanges: Array<[number, number]>,
  ): { start: number; end: number; match: string; kind: 'mention' | 'task-ref' } | null {
    // Whichever comes first: '@<name>' or 'T-<digits>'.
    const mentionRe = /(^|[^A-Za-z0-9_])@([A-Za-z][A-Za-z0-9_:.\-]{0,80})/g;
    const taskRe = /(^|[^A-Za-z0-9_])(T-\d{1,8})\b/g;

    mentionRe.lastIndex = from;
    taskRe.lastIndex = from;

    let mMatch: RegExpExecArray | null = null;
    while ((mMatch = mentionRe.exec(source)) !== null) {
      const at = mMatch.index + mMatch[1].length;
      if (!this.inSkip(at, skipRanges)) break;
      mentionRe.lastIndex = mMatch.index + mMatch[0].length;
      mMatch = null;
    }

    let tMatch: RegExpExecArray | null = null;
    while ((tMatch = taskRe.exec(source)) !== null) {
      const at = tMatch.index + tMatch[1].length;
      if (!this.inSkip(at, skipRanges)) break;
      taskRe.lastIndex = tMatch.index + tMatch[0].length;
      tMatch = null;
    }

    const mAt = mMatch ? mMatch.index + mMatch[1].length : -1;
    const tAt = tMatch ? tMatch.index + tMatch[1].length : -1;

    if (mAt === -1 && tAt === -1) return null;
    if (tAt === -1 || (mAt !== -1 && mAt < tAt)) {
      return {
        start: mAt,
        end: mMatch!.index + mMatch![0].length,
        match: '@' + mMatch![2],
        kind: 'mention',
      };
    }
    return {
      start: tAt,
      end: tMatch!.index + tMatch![0].length,
      match: tMatch![2],
      kind: 'task-ref',
    };
  }

  // ------------------------------------------------------------
  // Resolution
  // ------------------------------------------------------------

  private resolve(
    raw: string,
    kind: 'mention' | 'task-ref',
    ctx: MentionContext,
  ): { kind: MentionKind; id: string; display: string; markdown: string } | null {
    if (kind === 'task-ref') {
      const id = ctx.tasks.get(raw);
      if (!id) return null;
      return {
        kind: 'task',
        id,
        display: raw,
        markdown: `[${raw}](mention://task/${id})`,
      };
    }
    // raw is "@Name" — try users first, then agents.
    const name = raw.slice(1);
    const lower = name.toLowerCase();
    for (const map of [ctx.users, ctx.agents]) {
      // Build a case-insensitive view once.
    }
    const userId = this.lookupCaseInsensitive(ctx.users, lower);
    if (userId) {
      return {
        kind: 'user',
        id: userId,
        display: '@' + name,
        markdown: `[@${name}](mention://user/${userId})`,
      };
    }
    const agentId = this.lookupCaseInsensitive(ctx.agents, lower);
    if (agentId) {
      return {
        kind: 'agent',
        id: agentId,
        display: '@' + name,
        markdown: `[@${name}](mention://agent/${agentId})`,
      };
    }
    return null;
  }

  private lookupCaseInsensitive(map: Map<string, string>, lower: string): string | null {
    for (const [k, v] of map) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  }
}
