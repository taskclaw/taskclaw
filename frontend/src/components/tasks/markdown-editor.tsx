'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Bold, Italic, Heading2, List, ListChecks, Quote, Eye, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MarkdownEditorProps {
    value: string
    onSave: (value: string) => void
    placeholder?: string
    readOnly?: boolean
}

export function MarkdownEditor({ value, onSave, placeholder = 'Add a description...', readOnly = false }: MarkdownEditorProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const [showPreview, setShowPreview] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const prevValueRef = useRef(value)

    // Sync draft with external value only when value actually changes
    // (e.g. server refetch, switching tasks) — NOT when editing state changes
    useEffect(() => {
        if (value !== prevValueRef.current) {
            prevValueRef.current = value
            if (!editing) setDraft(value)
        }
    }, [value, editing])

    // Auto-focus and resize on edit start
    useEffect(() => {
        if (editing && textareaRef.current) {
            textareaRef.current.focus()
            resizeTextarea()
        }
    }, [editing])

    const resizeTextarea = () => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.max(120, el.scrollHeight)}px`
    }

    const handleSave = useCallback(() => {
        const trimmed = draft.trim()
        if (trimmed !== value.trim()) {
            onSave(trimmed)
        }
        setEditing(false)
        setShowPreview(false)
    }, [draft, value, onSave])

    const insertMarkdown = (prefix: string, suffix: string = '') => {
        const el = textareaRef.current
        if (!el) return
        const start = el.selectionStart
        const end = el.selectionEnd
        const selected = draft.slice(start, end)
        const newText = draft.slice(0, start) + prefix + selected + suffix + draft.slice(end)
        setDraft(newText)
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
            el.focus()
            const cursorPos = start + prefix.length + selected.length + suffix.length
            el.setSelectionRange(cursorPos, cursorPos)
        })
    }

    const toolbarActions = [
        { icon: Bold, action: () => insertMarkdown('**', '**'), title: 'Bold' },
        { icon: Italic, action: () => insertMarkdown('*', '*'), title: 'Italic' },
        { icon: Heading2, action: () => insertMarkdown('## '), title: 'Heading' },
        { icon: List, action: () => insertMarkdown('- '), title: 'Bullet list' },
        { icon: ListChecks, action: () => insertMarkdown('- [ ] '), title: 'Checklist' },
        { icon: Quote, action: () => insertMarkdown('> '), title: 'Quote' },
    ]

    // View mode — show draft (preserves just-saved text before server refetch)
    if (!editing) {
        const display = draft
        if (readOnly && !display.trim()) return null

        return (
            <div
                onClick={readOnly ? undefined : () => setEditing(true)}
                className={cn(
                    'bg-accent/50 border border-border rounded-xl p-4 text-sm leading-relaxed min-h-[60px]',
                    !readOnly && 'cursor-pointer hover:border-primary/30 transition-colors group',
                )}
            >
                {display.trim() ? (
                    <MarkdownRenderer content={display} />
                ) : (
                    <p className="text-muted-foreground/50 italic flex items-center gap-2">
                        {placeholder}
                        {!readOnly && <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </p>
                )}
            </div>
        )
    }

    // Edit mode
    return (
        <div className="bg-accent/50 border border-primary/30 rounded-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-accent/30">
                {toolbarActions.map(({ icon: Icon, action, title }) => (
                    <button
                        key={title}
                        onClick={action}
                        title={title}
                        type="button"
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Icon className="w-3.5 h-3.5" />
                    </button>
                ))}
                <div className="flex-1" />
                <button
                    onClick={() => setShowPreview(!showPreview)}
                    title={showPreview ? 'Edit' : 'Preview'}
                    type="button"
                    className={cn(
                        'p-1.5 rounded transition-colors',
                        showPreview
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    <Eye className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Editor / Preview */}
            {showPreview ? (
                <div className="p-4 text-sm leading-relaxed min-h-[120px]">
                    {draft.trim() ? (
                        <MarkdownRenderer content={draft} />
                    ) : (
                        <p className="text-muted-foreground/50 italic">Nothing to preview</p>
                    )}
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value)
                        resizeTextarea()
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setDraft(value)
                            setEditing(false)
                            setShowPreview(false)
                        }
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            handleSave()
                        }
                    }}
                    onBlur={handleSave}
                    placeholder={placeholder}
                    className="w-full p-4 bg-transparent text-sm leading-relaxed resize-none outline-none min-h-[120px] placeholder:text-muted-foreground/40 font-mono"
                />
            )}

            {/* Hint */}
            <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground/50 flex items-center justify-between">
                <span>Markdown supported</span>
                <span>
                    <kbd className="px-1 py-0.5 rounded bg-accent text-[9px]">&#8984;Enter</kbd> to save &middot;{' '}
                    <kbd className="px-1 py-0.5 rounded bg-accent text-[9px]">Esc</kbd> to cancel
                </span>
            </div>
        </div>
    )
}

// ─── Markdown Renderer ────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="whitespace-pre-wrap">
            {content.split('\n').map((line, i) => {
                if (line.startsWith('### ')) {
                    return (
                        <div key={i} className="text-sm font-bold mt-2 mb-1 first:mt-0">
                            {renderInline(line.slice(4))}
                        </div>
                    )
                }
                if (line.startsWith('## ')) {
                    return (
                        <div key={i} className="text-base font-bold mt-3 mb-1 first:mt-0">
                            {renderInline(line.slice(3))}
                        </div>
                    )
                }
                if (line.startsWith('# ')) {
                    return (
                        <div key={i} className="text-lg font-bold mt-3 mb-1 first:mt-0">
                            {renderInline(line.slice(2))}
                        </div>
                    )
                }
                if (line.match(/^- \[x\] /)) {
                    return (
                        <div key={i} className="flex items-center gap-2 py-0.5 text-muted-foreground line-through">
                            <span className="text-emerald-400">&#10003;</span>
                            {renderInline(line.slice(6))}
                        </div>
                    )
                }
                if (line.match(/^- \[ \] /)) {
                    return (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                            <span className="text-muted-foreground">&#9675;</span>
                            {renderInline(line.slice(6))}
                        </div>
                    )
                }
                if (line.startsWith('- ')) {
                    return (
                        <div key={i} className="flex items-start gap-2 py-0.5">
                            <span className="text-muted-foreground mt-1">&#8226;</span>
                            {renderInline(line.slice(2))}
                        </div>
                    )
                }
                if (line.startsWith('> ')) {
                    return (
                        <div key={i} className="border-l-2 border-primary/30 pl-3 py-0.5 text-muted-foreground italic">
                            {renderInline(line.slice(2))}
                        </div>
                    )
                }
                if (line === '---') {
                    return <hr key={i} className="border-border my-2" />
                }
                return (
                    <div key={i} className={cn('py-0.5', !line.trim() && 'h-3')}>
                        {renderInline(line)}
                    </div>
                )
            })}
        </div>
    )
}

/** Render inline markdown: **bold**, *italic*, `code`, ~~strikethrough~~ */
function renderInline(text: string): React.ReactNode {
    // Process inline markdown patterns
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
        // Bold: **text**
        const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/)
        if (boldMatch) {
            if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>)
            parts.push(<strong key={key++} className="font-bold">{boldMatch[2]}</strong>)
            remaining = boldMatch[3]
            continue
        }

        // Italic: *text*
        const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)$/)
        if (italicMatch) {
            if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>)
            parts.push(<em key={key++} className="italic">{italicMatch[2]}</em>)
            remaining = italicMatch[3]
            continue
        }

        // Code: `text`
        const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)$/)
        if (codeMatch) {
            if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>)
            parts.push(
                <code key={key++} className="px-1.5 py-0.5 rounded bg-accent text-xs font-mono text-primary">
                    {codeMatch[2]}
                </code>
            )
            remaining = codeMatch[3]
            continue
        }

        // Strikethrough: ~~text~~
        const strikeMatch = remaining.match(/^(.*?)~~(.+?)~~(.*)$/)
        if (strikeMatch) {
            if (strikeMatch[1]) parts.push(<span key={key++}>{strikeMatch[1]}</span>)
            parts.push(<del key={key++} className="line-through text-muted-foreground">{strikeMatch[2]}</del>)
            remaining = strikeMatch[3]
            continue
        }

        // No match — push remaining text as-is
        parts.push(<span key={key++}>{remaining}</span>)
        break
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>
}
