'use client'

import { Fragment } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Lightweight markdown-to-JSX renderer for integration setup guides.
// Supports: ## / ### headings, numbered lists, bullet lists, **bold**,
// `inline code`, [links](url), and plain paragraphs.
// ============================================================================

interface SetupGuideRendererProps {
    content: string
    className?: string
}

// Inline formatting: **bold**, `code`, [text](url)
function renderInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = []
    // Regex matches: [text](url) | **bold** | `code`
    const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
        // Push preceding plain text
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index))
        }

        if (match[1] && match[2]) {
            // Link: [text](url)
            parts.push(
                <a
                    key={match.index}
                    href={match[2]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                    {match[1]}
                    <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                </a>
            )
        } else if (match[3]) {
            // Bold: **text**
            parts.push(
                <strong key={match.index} className="font-semibold text-foreground">
                    {match[3]}
                </strong>
            )
        } else if (match[4]) {
            // Inline code: `text`
            parts.push(
                <code
                    key={match.index}
                    className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-foreground/80"
                >
                    {match[4]}
                </code>
            )
        }

        lastIndex = match.index + match[0].length
    }

    // Remaining plain text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
}

interface ParsedBlock {
    type: 'h2' | 'h3' | 'h4' | 'ol-item' | 'ul-item' | 'paragraph' | 'blank'
    content: string
    indent?: number
}

function parseBlocks(content: string): ParsedBlock[] {
    const lines = content.split('\n')
    const blocks: ParsedBlock[] = []

    for (const line of lines) {
        const trimmed = line.trim()

        if (!trimmed) {
            blocks.push({ type: 'blank', content: '' })
        } else if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
            blocks.push({ type: 'h2', content: trimmed.slice(3) })
        } else if (trimmed.startsWith('### ')) {
            blocks.push({ type: 'h3', content: trimmed.slice(4) })
        } else if (trimmed.startsWith('#### ')) {
            blocks.push({ type: 'h4', content: trimmed.slice(5) })
        } else if (/^\d+\.\s/.test(trimmed)) {
            blocks.push({ type: 'ol-item', content: trimmed.replace(/^\d+\.\s/, '') })
        } else if (/^[-*]\s/.test(trimmed)) {
            // Check if it's indented (sub-bullet)
            const leadingSpaces = line.length - line.trimStart().length
            blocks.push({ type: 'ul-item', content: trimmed.replace(/^[-*]\s/, ''), indent: leadingSpaces })
        } else {
            blocks.push({ type: 'paragraph', content: trimmed })
        }
    }

    return blocks
}

export function SetupGuideRenderer({ content, className }: SetupGuideRendererProps) {
    const blocks = parseBlocks(content)
    const elements: React.ReactNode[] = []
    let olCounter = 0
    let inOl = false

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const key = `block-${i}`

        switch (block.type) {
            case 'blank':
                inOl = false
                olCounter = 0
                break

            case 'h2':
                inOl = false
                olCounter = 0
                elements.push(
                    <h2 key={key} className="text-sm font-bold text-foreground mt-4 first:mt-0 mb-2">
                        {renderInline(block.content)}
                    </h2>
                )
                break

            case 'h3':
                inOl = false
                olCounter = 0
                elements.push(
                    <div
                        key={key}
                        className="flex items-center gap-2 mt-4 mb-2"
                    >
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                            {renderInline(block.content)}
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                )
                break

            case 'h4':
                inOl = false
                olCounter = 0
                elements.push(
                    <h4 key={key} className="text-xs font-semibold text-foreground mt-3 mb-1">
                        {renderInline(block.content)}
                    </h4>
                )
                break

            case 'ol-item': {
                if (!inOl) {
                    olCounter = 0
                    inOl = true
                }
                olCounter++
                elements.push(
                    <div key={key} className="flex gap-3 py-1.5">
                        <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">
                            {olCounter}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                            {renderInline(block.content)}
                        </p>
                    </div>
                )
                break
            }

            case 'ul-item': {
                inOl = false
                olCounter = 0
                const isIndented = (block.indent ?? 0) >= 2
                elements.push(
                    <div key={key} className={cn('flex gap-2 py-0.5', isIndented && 'ml-5')}>
                        <span className="text-muted-foreground/50 mt-1.5 shrink-0">
                            {isIndented ? '◦' : '•'}
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                            {renderInline(block.content)}
                        </p>
                    </div>
                )
                break
            }

            case 'paragraph':
                inOl = false
                olCounter = 0
                elements.push(
                    <p key={key} className="text-xs text-muted-foreground leading-relaxed py-0.5">
                        {renderInline(block.content)}
                    </p>
                )
                break
        }
    }

    return (
        <div className={cn('space-y-0', className)}>
            {elements}
        </div>
    )
}
