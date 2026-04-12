'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, BrainCircuit, CheckCircle, ListPlus, Layers, Plug, ArrowRight, Globe } from 'lucide-react'
import Link from 'next/link'
import {
    getOrCreateBoardConversation,
    getOrCreatePodConversation,
    getOrCreateWorkspaceConversation,
    sendMessageBackground,
    getMessages,
} from '@/app/dashboard/chat/actions'
import { bulkCreateBoardTasks } from '@/app/dashboard/boards/actions'
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

interface BoardAIChatProps {
    // Board mode
    boardId?: string
    boardName?: string
    // Pod mode
    podId?: string
    podName?: string
    // Workspace mode (cockpit chat — sees all pods/boards)
    isWorkspace?: boolean
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
    isWorkspace,
    open,
    onOpenChange,
    onClose,
}: BoardAIChatProps) {
    const isPodMode = !!podId && !isWorkspace
    const isWorkspaceMode = !!isWorkspace
    const contextName = isWorkspaceMode ? 'Workspace' : isPodMode ? (podName ?? 'Pod') : (boardName ?? 'Board')

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

    // Re-init whenever the sheet opens or the context changes
    useEffect(() => {
        if (!open) return
        let cancelled = false

        async function init() {
            setIsInitializing(true)
            setError(null)
            setMessages([])

            try {
                const result = isWorkspaceMode
                    ? await getOrCreateWorkspaceConversation()
                    : isPodMode
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
    }, [open, boardId, podId, isWorkspace])

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
        ? (isProcessing ? 'Wait for AI to respond...' : 'Ask anything — run pilots, trigger routes, review pods...')
        : isPodMode
        ? (isProcessing ? 'Wait for AI to respond...' : `Ask the ${contextName} AI anything...`)
        : (isProcessing ? 'Wait for AI to respond...' : 'Describe the tasks you want to create...')

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-[420px] sm:max-w-[420px] p-0 flex flex-col gap-0"
                onInteractOutside={(e) => e.preventDefault()}
            >
                {/* Header */}
                <SheetHeader className="px-4 py-3 border-b bg-primary/5 shrink-0">
                    <div className="flex items-center gap-2.5 pr-6">
                        {isWorkspaceMode
                            ? <Globe className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                            : isPodMode
                            ? <Layers className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                            : <BrainCircuit className={cn('w-4 h-4', isProcessing ? 'text-amber-500 animate-pulse' : 'text-primary')} />
                        }
                        <div className="flex-1 min-w-0">
                            <SheetTitle className="text-sm leading-tight">{contextName}</SheetTitle>
                            <SheetDescription className="text-[11px] leading-tight">
                                {isWorkspaceMode ? 'Workspace AI · Can trigger pods, boards & routes' : isPodMode ? 'Pod AI Chat' : 'Board AI Chat'}
                            </SheetDescription>
                        </div>
                        {isProcessing && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium shrink-0">
                                Thinking…
                            </span>
                        )}
                    </div>
                </SheetHeader>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                    {isInitializing && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            Starting AI session…
                        </div>
                    )}

                    {!isInitializing && messages.length === 0 && !isProcessing && !error && (
                        <div className="text-center py-8 space-y-3">
                            {isWorkspaceMode
                                ? <Globe className="w-10 h-10 mx-auto text-muted-foreground/20" />
                                : isPodMode
                                ? <Layers className="w-10 h-10 mx-auto text-muted-foreground/20" />
                                : <BrainCircuit className="w-10 h-10 mx-auto text-muted-foreground/20" />
                            }
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {isWorkspaceMode
                                        ? 'Your Workspace AI. Ask it to review pods, trigger pilots, route tasks, or coordinate across departments.'
                                        : isPodMode
                                        ? `Chat with the ${contextName} AI assistant.`
                                        : 'Describe the tasks you want to create on this board.'
                                    }
                                </p>
                                {isWorkspaceMode && (
                                    <p className="text-xs text-muted-foreground/60 mt-1">
                                        Example: &quot;Review all pending tasks and suggest next steps&quot;
                                    </p>
                                )}
                                {!isPodMode && !isWorkspaceMode && (
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

                        const proposedTasks = !isPodMode && msg.role === 'assistant' ? extractTasksJson(msg.content) : null
                        const isCreated = createdMessageIds.has(messageId)
                        const isCreating = creatingTasks === messageId

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
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                        />
                                    ) : (
                                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                    )}
                                </div>

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
            </SheetContent>
        </Sheet>
    )
}
