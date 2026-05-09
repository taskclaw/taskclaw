'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, BrainCircuit, CheckCircle, ListPlus, Layers, Plug, ArrowRight, ChevronDown, ChevronRight, Activity, Target, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import {
    getOrCreateBoardConversation,
    getOrCreatePodConversation,
    sendMessageBackground,
    getMessages,
} from '@/app/dashboard/chat/actions'
import { bulkCreateBoardTasks } from '@/app/dashboard/boards/actions'
import { getRecentOrchestrations, type OrchestrationSummary } from '@/app/dashboard/pods/actions'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { renderMarkdown, extractTasksJson } from '@/lib/markdown'
import { toast } from 'sonner'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { usePod, usePodBoards } from '@/hooks/use-pods'
import { useAgents } from '@/hooks/use-agents'
import { PodContextSidebar } from '@/components/orchestration/pod-context-sidebar'

interface Message {
    id?: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at?: string
    metadata?: Record<string, any>
}

interface ProposedTasks {
    messageId: string
    tasks: Array<{ title: string; priority?: string; notes?: string; card_data?: Record<string, any> }>
}

interface DelegationCard {
    pod_id: string
    pod_name?: string
    pod_slug?: string
    goal: string
    orchestration_id?: string
    status?: string
    tasks?: Array<{ title: string; priority?: string }>
}

function extractJsonObjects(text: string): DelegationCard[] {
    const cards: DelegationCard[] = []
    let i = 0
    while (i < text.length) {
        const start = text.indexOf('{', i)
        if (start === -1) break
        let depth = 0, j = start
        let inStr = false, esc = false
        while (j < text.length) {
            const ch = text[j]
            if (esc) { esc = false; j++; continue }
            if (ch === '\\' && inStr) { esc = true; j++; continue }
            if (ch === '"') inStr = !inStr
            if (!inStr) {
                if (ch === '{') depth++
                else if (ch === '}') { depth--; if (depth === 0) break }
            }
            j++
        }
        if (depth === 0) {
            try {
                const obj = JSON.parse(text.slice(start, j + 1))
                if (obj?.pod_id && (obj.goal || obj.orchestration_id)) cards.push(obj as DelegationCard)
            } catch { /* skip */ }
            i = j + 1
        } else { i = start + 1 }
    }
    return cards
}

function extractDelegationCards(content: string): DelegationCard[] {
    const cards: DelegationCard[] = []
    const seen = new Set<string>()
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/g
    let m
    const usedRanges: Array<[number, number]> = []
    while ((m = fenced.exec(content)) !== null) {
        const found = extractJsonObjects(m[1])
        found.forEach(c => cards.push(c))
        if (found.length > 0) usedRanges.push([m.index, m.index + m[0].length])
    }
    let remaining = content
    for (const [s, e] of usedRanges.slice().reverse()) {
        remaining = remaining.slice(0, s) + ' '.repeat(e - s) + remaining.slice(e)
    }
    extractJsonObjects(remaining).forEach(c => cards.push(c))
    return cards.filter(c => {
        const key = `${c.pod_id}:${(c.goal || '').slice(0, 60)}`
        if (seen.has(key)) return false
        seen.add(key); return true
    })
}

interface BoardAIChatProps {
    // Board mode
    boardId?: string
    boardName?: string
    // Pod mode
    podId?: string
    podName?: string
    podSlug?: string
    // Workspace mode
    isWorkspace?: boolean
    initialConversationId?: string | null
    // Sheet control
    open: boolean
    onOpenChange: (open: boolean) => void
    // Legacy support
    onClose?: () => void
}

export function BoardAIChat({
    boardId,
    boardName,
    podId,
    podName,
    podSlug,
    isWorkspace,
    initialConversationId: _initialConversationId,
    open,
    onOpenChange,
    onClose,
}: BoardAIChatProps) {
    const isPodMode = !!podId
    const isWorkspaceMode = !!isWorkspace
    const contextName = isWorkspaceMode ? 'Workspace' : (isPodMode ? (podName ?? 'Pod') : (boardName ?? 'Board'))

    // Detect "no backbone configured" vs other errors
    const isNoBackboneError = (err: string | null) =>
        !!err && (err.toLowerCase().includes('no backbone') || err.toLowerCase().includes('backbone connection'))

    const [conversationId, setConversationId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isInitializing, setIsInitializing] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [creatingTasks, setCreatingTasks] = useState<string | null>(null)
    const [createdMessageIds, setCreatedMessageIds] = useState<Set<string>>(new Set())
    const [contextOpen, setContextOpen] = useState(false)
    const [orchestrations, setOrchestrations] = useState<OrchestrationSummary[]>([])
    const [orchLoading, setOrchLoading] = useState(false)
    const orchPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Pod context data (only fetched in pod mode when slug is available)
    const { data: podData } = usePod(isPodMode && podSlug ? podSlug : '__skip__')
    const { data: podBoards = [] } = usePodBoards(isPodMode && podData?.id ? podData.id : null)
    const { data: allAgents } = useAgents()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const queryClient = useQueryClient()

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => { scrollToBottom() }, [messages, isProcessing, scrollToBottom])

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
        }
    }, [])

    const loadOrchestrations = useCallback(async () => {
        if (!isWorkspaceMode) return
        try {
            const data = await getRecentOrchestrations(20)
            setOrchestrations(data)
        } catch { /* silent */ }
    }, [isWorkspaceMode])

    const startOrchPolling = useCallback(() => {
        if (orchPollRef.current) clearInterval(orchPollRef.current)
        orchPollRef.current = setInterval(loadOrchestrations, 5000)
    }, [loadOrchestrations])

    const stopOrchPolling = useCallback(() => {
        if (orchPollRef.current) { clearInterval(orchPollRef.current); orchPollRef.current = null }
    }, [])

    const loadMessages = useCallback(async (convId: string) => {
        try {
            const result = await getMessages(convId)
            if (result?.data && Array.isArray(result.data)) {
                const msgs: Message[] = result.data.map((m: any) => ({
                    id: m.id, role: m.role, content: m.content,
                    created_at: m.created_at, metadata: m.metadata,
                }))
                setMessages(msgs)
                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg?.role === 'user') {
                    setIsProcessing(true)
                } else {
                    setIsProcessing(false)
                    stopPolling()
                    if (boardId) queryClient.invalidateQueries({ queryKey: ['boardTasks', boardId] })
                }
                return msgs
            }
        } catch (err) {
            console.error('[BoardAIChat] Failed to load messages:', err)
        }
        return []
    }, [queryClient, stopPolling, boardId])

    const startPolling = useCallback((convId: string) => {
        stopPolling()
        pollTimerRef.current = setInterval(() => loadMessages(convId), 5000)
    }, [stopPolling, loadMessages])

    useEffect(() => { return () => stopPolling() }, [stopPolling])

    // Orchestrations polling for workspace mode
    useEffect(() => {
        if (!open || !isWorkspaceMode) return
        setOrchLoading(true)
        loadOrchestrations().finally(() => setOrchLoading(false))
        startOrchPolling()
        return () => stopOrchPolling()
    }, [open, isWorkspaceMode, loadOrchestrations, startOrchPolling, stopOrchPolling])

    // Re-init whenever the sheet opens or the context changes
    useEffect(() => {
        if (!open) return
        let cancelled = false

        async function init() {
            setIsInitializing(true)
            setError(null)
            setMessages([])

            try {
                const result = isPodMode
                    ? await getOrCreatePodConversation(podId!, contextName)
                    : await getOrCreateBoardConversation(boardId!, contextName)

                if (cancelled) return

                if (result?.error) { setError(result.error); setIsInitializing(false); return }

                if (result?.id) {
                    setConversationId(result.id)
                    await loadMessages(result.id)
                    if (!cancelled) { setIsInitializing(false); inputRef.current?.focus() }
                } else {
                    setError('Failed to initialize chat session')
                    setIsInitializing(false)
                }
            } catch (err: any) {
                if (!cancelled) { setError(err.message || 'Failed to initialize'); setIsInitializing(false) }
            }
        }

        init()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, boardId, podId])

    useEffect(() => {
        if (isProcessing && conversationId) startPolling(conversationId)
        return () => { if (!isProcessing) stopPolling() }
    }, [isProcessing, conversationId, startPolling, stopPolling])

    const handleSend = async () => {
        const content = input.trim()
        if (!content || !conversationId || isSending || isProcessing) return

        setInput('')
        setError(null)
        setIsSending(true)
        setMessages(prev => [...prev, { role: 'user', content }])

        try {
            const result = await sendMessageBackground(conversationId, content)
            if (result?.error) { setError(result.error); setIsSending(false); return }
            setIsProcessing(true)
            startPolling(conversationId)
        } catch (err: any) {
            setError(err.message || 'Failed to send message')
        } finally {
            setIsSending(false)
        }
    }

    const handleCreateTasks = async (proposed: ProposedTasks) => {
        if (!boardId) return
        setCreatingTasks(proposed.messageId)
        try {
            const result = await bulkCreateBoardTasks(boardId, proposed.tasks)
            if (result?.error) { toast.error(result.error); setCreatingTasks(null); return }
            setCreatedMessageIds(prev => new Set(prev).add(proposed.messageId))
            queryClient.invalidateQueries({ queryKey: ['boardTasks', boardId] })
            toast.success(`Created ${proposed.tasks.length} tasks on the board`)
        } catch (err: any) {
            toast.error(err.message || 'Failed to create tasks')
        } finally {
            setCreatingTasks(null)
        }
    }

    const handleClose = () => {
        onOpenChange(false)
        onClose?.()
    }

    const getPriorityColor = (priority?: string) => {
        switch (priority?.toLowerCase()) {
            case 'high': return 'text-red-400'
            case 'low': return 'text-blue-400'
            default: return 'text-amber-400'
        }
    }

    const placeholder = isWorkspaceMode
        ? (isProcessing ? 'Wait for coordinator...' : 'Describe what you want to accomplish...')
        : isPodMode
            ? (isProcessing ? 'Wait for AI to respond...' : `Ask the ${contextName} AI anything...`)
            : (isProcessing ? 'Wait for AI to respond...' : 'Describe the tasks you want to create...')

    const orchStatusConfig: Record<string, { label: string; className: string }> = {
        pending_approval: { label: 'Pending', className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
        running: { label: 'Running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20' },
        completed: { label: 'Done', className: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20' },
        failed: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
        cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className={cn('p-0 flex flex-col gap-0', isWorkspaceMode ? 'w-[820px] sm:max-w-[820px]' : 'w-[420px] sm:max-w-[420px]')}
                onInteractOutside={(e) => e.preventDefault()}
            >
                {/* Header */}
                <SheetHeader className="px-4 py-3 border-b bg-primary/5 shrink-0">
                    <div className="flex items-center gap-2.5 pr-6">
                        {isWorkspaceMode
                            ? <BrainCircuit className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                            : isPodMode
                                ? <Layers className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                                : <BrainCircuit className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                        }
                        <div className="flex-1 min-w-0">
                            <SheetTitle className="text-sm leading-tight">{contextName}</SheetTitle>
                            <SheetDescription className="text-[11px] leading-tight">
                                {isWorkspaceMode ? 'Workspace Coordinator' : isPodMode ? 'Pod AI Chat' : 'Board AI Chat'}
                            </SheetDescription>
                        </div>
                        {isProcessing && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium shrink-0">
                                Thinking…
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {/* Pod context sidebar (collapsible, pod mode only) */}
                {isPodMode && podData && (
                    <div className="shrink-0 border-b">
                        <button
                            type="button"
                            onClick={() => setContextOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-accent/30 transition-colors"
                        >
                            {contextOpen
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            }
                            <span className="text-[11px] font-medium text-muted-foreground">
                                Pod context
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground/50">
                                {(podBoards as any[]).length} board{(podBoards as any[]).length !== 1 ? 's' : ''}
                            </span>
                        </button>
                        {contextOpen && (
                            <div className="px-4 pb-3">
                                <PodContextSidebar
                                    pod={podData}
                                    boards={podBoards as any[]}
                                    agents={((allAgents as any[]) || []).filter((a: any) => a.is_active)}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Main body — chat + optional execution sidebar */}
                <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Messages */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                    {isInitializing && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            Starting AI session…
                        </div>
                    )}

                    {!isInitializing && messages.length === 0 && !isProcessing && !error && (
                        <div className="text-center py-8 space-y-3">
                            {isPodMode
                                ? <Layers className="w-10 h-10 mx-auto text-muted-foreground/20" />
                                : <BrainCircuit className="w-10 h-10 mx-auto text-muted-foreground/20" />
                            }
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {isPodMode
                                        ? `Chat with the ${contextName} AI assistant.`
                                        : 'Describe the tasks you want to create on this board.'
                                    }
                                </p>
                                {!isPodMode && (
                                    <p className="text-xs text-muted-foreground/60 mt-1">
                                        Example: &quot;Create 10 posts about AI in different markets&quot;
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => {
                        const messageId = msg.id || `msg-${i}`
                        const isError = msg.metadata?.error === true

                        if (msg.role === 'system' && isError) {
                            return (
                                <div key={messageId} className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                    {msg.content}
                                </div>
                            )
                        }
                        if (msg.role === 'system') return null

                        const proposedTasks = !isPodMode && !isWorkspaceMode && msg.role === 'assistant' ? extractTasksJson(msg.content) : null
                        const delegationCards = isWorkspaceMode && msg.role === 'assistant' ? extractDelegationCards(msg.content) : null
                        const isCreated = createdMessageIds.has(messageId)
                        const isCreating = creatingTasks === messageId

                        // Strip raw JSON blocks from workspace assistant messages so they don't render as text
                        let displayContent = msg.content
                        if (isWorkspaceMode && msg.role === 'assistant' && delegationCards && delegationCards.length > 0) {
                            // Remove fenced blocks with pod_id JSON
                            displayContent = displayContent.replace(/```(?:json)?\s*[\s\S]*?"pod_id"[\s\S]*?```/g, '')
                            // Remove bare JSON objects via bracket counting
                            const toRemove: Array<[number, number]> = []
                            let si = 0
                            while (si < displayContent.length) {
                                const ss = displayContent.indexOf('{"pod_id"', si)
                                if (ss === -1) break
                                let dp = 0, sj = ss, inS = false, es = false
                                while (sj < displayContent.length) {
                                    const c = displayContent[sj]
                                    if (es) { es = false; sj++; continue }
                                    if (c === '\\' && inS) { es = true; sj++; continue }
                                    if (c === '"') inS = !inS
                                    if (!inS) { if (c === '{') dp++; else if (c === '}') { dp--; if (dp === 0) break } }
                                    sj++
                                }
                                if (dp === 0) { toRemove.push([ss, sj + 1]); si = sj + 1 } else si = ss + 1
                            }
                            for (const [s, e] of toRemove.reverse()) {
                                displayContent = displayContent.slice(0, s) + displayContent.slice(e)
                            }
                            displayContent = displayContent.trim()
                        }

                        return (
                            <div key={messageId} className="space-y-2">
                                <div className={cn(
                                    'text-sm rounded-lg px-4 py-3',
                                    msg.role === 'user'
                                        ? 'bg-primary/15 text-primary ml-auto max-w-[85%]'
                                        : 'bg-accent/30 border border-border',
                                )}>
                                    {msg.role === 'assistant' ? (
                                        <div
                                            className="prose-chat break-words text-sm leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:text-sm [&_code]:text-[13px]"
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
                                        />
                                    ) : (
                                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                    )}
                                </div>

                                {/* Delegation cards for workspace/cockpit mode */}
                                {delegationCards && delegationCards.length > 0 && (
                                    <div className="ml-2 space-y-1.5">
                                        <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 px-1">
                                            <Activity className="w-3 h-3" />
                                            {delegationCards.length} pod{delegationCards.length !== 1 ? 's' : ''} delegated
                                        </div>
                                        {delegationCards.map((card, ci) => (
                                            <div key={ci} className="flex items-start gap-2 bg-accent/20 border border-border rounded-lg px-3 py-2">
                                                <Target className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium truncate">{card.goal}</div>
                                                    {(card.pod_name || card.pod_slug) && (
                                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                                            Pod: {card.pod_name || card.pod_slug}
                                                        </div>
                                                    )}
                                                </div>
                                                {card.status && (
                                                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0',
                                                        card.status === 'pending_approval' && 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
                                                        card.status === 'running' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
                                                        card.status === 'completed' && 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
                                                        card.status === 'failed' && 'bg-destructive/15 text-destructive',
                                                    )}>
                                                        {card.status}
                                                    </Badge>
                                                )}
                                                {card.pod_slug && (
                                                    <Link href={`/dashboard/pods/${card.pod_slug}?tab=goals`}
                                                        className="text-[10px] text-primary hover:underline shrink-0">
                                                        View
                                                    </Link>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {proposedTasks && (
                                    <div className="ml-2 border border-border rounded-lg overflow-hidden bg-accent/20">
                                        <div className="px-3 py-2 border-b border-border bg-accent/30 flex items-center justify-between">
                                            <span className="text-xs font-medium flex items-center gap-1.5">
                                                <ListPlus className="w-3.5 h-3.5" />
                                                {proposedTasks.length} proposed task{proposedTasks.length !== 1 ? 's' : ''}
                                            </span>
                                            {isCreated ? (
                                                <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Created
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleCreateTasks({ messageId, tasks: proposedTasks })}
                                                    disabled={isCreating}
                                                    className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    {isCreating ? (
                                                        <><Loader2 className="w-3 h-3 animate-spin" />Creating…</>
                                                    ) : (
                                                        <>Create {proposedTasks.length} Tasks</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {proposedTasks.map((task, ti) => (
                                                <div key={ti} className="px-3 py-1.5 border-b border-border/50 last:border-b-0 flex items-start gap-2">
                                                    <span className="text-[10px] text-muted-foreground mt-0.5 shrink-0 w-4">{ti + 1}.</span>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-medium block truncate">{task.title}</span>
                                                        {task.notes && (
                                                            <span className="text-[10px] text-muted-foreground block truncate">{task.notes}</span>
                                                        )}
                                                    </div>
                                                    {task.priority && (
                                                        <span className={cn('text-[10px] font-medium shrink-0', getPriorityColor(task.priority))}>
                                                            {task.priority}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {isProcessing && (
                        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                            <BrainCircuit className="w-3.5 h-3.5 animate-pulse" />
                            <span>
                                AI is thinking…
                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                    This may take a moment.
                                </span>
                            </span>
                        </div>
                    )}

                    {error && (
                        isNoBackboneError(error) ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-accent/50 flex items-center justify-center">
                                    <Plug className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold mb-1">No AI backbone connected</p>
                                    <p className="text-xs text-muted-foreground max-w-[220px]">
                                        Connect an AI backbone (OpenClaw, OpenRouter, or Anthropic) to start chatting.
                                    </p>
                                </div>
                                <Link
                                    href="/dashboard/settings/backbones"
                                    onClick={() => onOpenChange(false)}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                    Go to Backbone Settings
                                    <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        ) : (
                            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input — hidden when no backbone is configured */}
                <div className={cn('p-3 border-t shrink-0', isNoBackboneError(error) && 'hidden')}>
                    <div className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                                if (e.key === 'Escape') handleClose()
                            }}
                            placeholder={placeholder}
                            disabled={isSending || isProcessing || !conversationId}
                            className="flex-1 bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm placeholder-muted-foreground outline-none focus:border-primary/30 transition-colors disabled:opacity-50"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isSending || isProcessing || !conversationId}
                            className="p-2 bg-primary/20 border border-primary/30 rounded-lg text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                </div>{/* end chat column */}

                {/* Execution sidebar — workspace mode only */}
                {isWorkspaceMode && (
                    <div className="w-[280px] shrink-0 border-l flex flex-col min-h-0">
                        <div className="px-3 py-2.5 border-b bg-accent/20 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-semibold">Execution</span>
                            </div>
                            <button
                                onClick={() => { setOrchLoading(true); loadOrchestrations().finally(() => setOrchLoading(false)) }}
                                className="p-0.5 rounded hover:bg-accent transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw className={cn('w-3 h-3 text-muted-foreground', orchLoading && 'animate-spin')} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                            {orchLoading && orchestrations.length === 0 && (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground p-2">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Loading…
                                </div>
                            )}
                            {!orchLoading && orchestrations.length === 0 && (
                                <div className="text-center py-6">
                                    <Activity className="w-7 h-7 mx-auto text-muted-foreground/20 mb-2" />
                                    <p className="text-[11px] text-muted-foreground">No executions yet</p>
                                </div>
                            )}
                            {orchestrations.map((orch) => {
                                const sc = orchStatusConfig[orch.status] ?? { label: orch.status, className: 'bg-muted text-muted-foreground' }
                                const podSlugVal = orch.pod_slug
                                return (
                                    <div key={orch.id} className="bg-accent/20 border border-border rounded-lg px-2.5 py-2 space-y-1">
                                        <div className="flex items-start gap-1.5">
                                            <Target className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                                            <span className="text-[11px] font-medium leading-snug flex-1 min-w-0 line-clamp-2">
                                                {orch.goal}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                            <Badge variant="outline" className={cn('text-[9px] px-1 py-0', sc.className)}>
                                                {sc.label}
                                            </Badge>
                                            {orch.pod_name && (
                                                <span className="text-[9px] text-muted-foreground truncate">
                                                    {orch.pod_name}
                                                </span>
                                            )}
                                            {podSlugVal && (
                                                <Link href={`/dashboard/pods/${podSlugVal}?tab=goals`}
                                                    className="text-[9px] text-primary hover:underline shrink-0">
                                                    View
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
                </div>{/* end main body row */}

            </SheetContent>
        </Sheet>
    )
}
