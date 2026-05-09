'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MessageKind =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'log';

export interface KindMessageProps {
  kind: MessageKind | undefined | null;
  content: string;
  metadata?: Record<string, any> | null;
  /** Render the default text body when kind is 'text' or unknown. */
  fallback: React.ReactNode;
  /** Show 'log' kind only when this is true. Defaults to false (production). */
  devMode?: boolean;
}

/**
 * Render a single message according to its `kind` (PRD §8.1).
 * Defaults to the parent's `fallback` for plain text — keeps the existing
 * markdown rendering path untouched while adding affordances for the
 * other six kinds.
 */
export function MessageKindRenderer({
  kind,
  content,
  metadata,
  fallback,
  devMode = false,
}: KindMessageProps) {
  if (!kind || kind === 'text') return <>{fallback}</>;

  if (kind === 'thinking') return <ThinkingBlock content={content} />;
  if (kind === 'tool_use') return <ToolUseBlock content={content} metadata={metadata} />;
  if (kind === 'tool_result')
    return <ToolResultBlock content={content} metadata={metadata} />;
  if (kind === 'status') return <StatusBlock content={content} />;
  if (kind === 'error') return <ErrorBlock content={content} />;
  if (kind === 'log') {
    if (!devMode) return null;
    return <LogBlock content={content} />;
  }
  return <>{fallback}</>;
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Thinking
      </button>
      {open && (
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
          {content}
        </pre>
      )}
    </div>
  );
}

function ToolUseBlock({
  content,
  metadata,
}: {
  content: string;
  metadata?: Record<string, any> | null;
}) {
  const toolName = (metadata?.tool_name as string | undefined) ?? 'tool';
  const args = metadata?.args ?? metadata?.input;
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-medium text-blue-600">
        <Wrench className="h-3 w-3" />
        Tool call: <code className="font-mono">{toolName}</code>
      </div>
      {(args || content) && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
          {args ? JSON.stringify(args, null, 2) : content}
        </pre>
      )}
    </div>
  );
}

function ToolResultBlock({
  content,
  metadata,
}: {
  content: string;
  metadata?: Record<string, any> | null;
}) {
  const toolName = (metadata?.tool_name as string | undefined) ?? 'tool';
  const ok = metadata?.error ? false : true;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        ok
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 font-medium',
          ok ? 'text-emerald-700' : 'text-destructive',
        )}
      >
        {ok ? '↳' : '⚠'} <span>Tool result: <code className="font-mono">{toolName}</code></span>
      </div>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
        {content}
      </pre>
    </div>
  );
}

function StatusBlock({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{content}</span>
    </div>
  );
}

function ErrorBlock({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="whitespace-pre-wrap">{content}</span>
    </div>
  );
}

function LogBlock({ content }: { content: string }) {
  return (
    <pre className="rounded-md border border-dashed border-border/40 bg-muted/30 px-3 py-2 font-mono text-[10px] leading-tight text-muted-foreground">
      {content}
    </pre>
  );
}
