'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Loader2, FileDown, CheckCircle, ExternalLink, BrainCircuit, Play } from 'lucide-react'
import { useMemo } from 'react'
import { getOrCreateConversation, sendMessageBackground, getMessages, saveAiToTask } from '@/app/dashboard/chat/actions'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface Message {
    id?: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at?: string
    metadata?: Record<string, any>
}

/** Lightweight markdown-to-HTML for AI chat messages */
function renderMarkdown(text: string): string {
    // Remove output_json blocks (already parsed by backend)
    let html = text.replace(/```output_json[\s\S]*?```/g, '')

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
        `<pre class="bg-accent/80 border border-border rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono whitespace-pre">${escapeHtml(code.trim())}</pre>`)

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-accent/80 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4 class="font-bold text-sm mt-3 mb-1">$1</h4>')
    html = html.replace(/^## (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1">$1</h3>')
    html = html.replace(/^# (.+)$/gm, '<h3 class="font-bold text-base mt-3 mb-1">$1</h3>')

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr class="border-border my-2" />')

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')

    // Numbered lists
    html = html.replace(/^\d+[./] (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')

    // Wrap consecutive <li> tags
    html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>')

    // Line breaks (double newline = paragraph, single = br)
    html = html.replace(/\n\n/g, '</p><p class="mt-2">')
    html = html.replace(/\n/g, '<br />')

    // Wrap in paragraph
    html = `<p>${html}</p>`

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '')

    return html
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

interface TaskAIChatProps {
    taskId: string
    taskTitle: string
    taskDescription?: string | null
    sourceProvider?: string | null // 'notion' | 'clickup' | null
    autoStart?: boolean // When true, sends task context immediately without requiring user input
    onClose: () => void
}

export function TaskAIChat({ taskId, taskTitle, taskDescription, sourceProvider, autoStart = false, onClose }: TaskAIChatProps) {
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isInitializing, setIsInitializing] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [savingMessageId, setSavingMessageId] = useState<string | null>(null)
    const [savedMessages, setSavedMessages] = useState<Set<string>>(new Set())
    const [syncFeedback, setSyncFeedback] = useState<Record<string, string>>({})
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const autoStartTriggered = useRef(false)
    const queryClient = useQueryClient()

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, isProcessing, scrollToBottom])

    // Stop polling
    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
        }
    }, [])

    // Load messages and check if AI is still processing
    const loadMessages = useCallback(async (convId: string) => {
        try {
            const result = await getMessages(convId)
            if (result?.data && Array.isArray(result.data)) {
                const msgs: Message[] = result.data.map((m: any) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    created_at: m.created_at,
                    metadata: m.metadata,
                }))
                setMessages(msgs)

                // Check if the last message is from user (AI still processing)
                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg && lastMsg.role === 'user') {
                    setIsProcessing(true)
                } else {
                    setIsProcessing(false)
                    // AI has responded — stop polling and refresh tasks to update Kanban
                    stopPolling()
                    queryClient.invalidateQueries({ queryKey: ['tasks'] })
                }

                return msgs
            } else {
                console.warn('[TaskAIChat] loadMessages: unexpected response format:', result)
            }
        } catch (err) {
            console.error('[TaskAIChat] Failed to load messages:', err)
        }
        return []
    }, [queryClient, stopPolling])

    // Start polling for new messages (every 5s)
    const startPolling = useCallback((convId: string) => {
        stopPolling()
        pollTimerRef.current = setInterval(() => {
            loadMessages(convId)
        }, 5000)
    }, [stopPolling, loadMessages])

    // Cleanup polling on unmount
    useEffect(() => {
        return () => stopPolling()
    }, [stopPolling])

    // Initialize conversation on mount — reuses existing conversation if available.
    // Only depends on taskId to avoid unnecessary re-runs from callback ref changes.
    useEffect(() => {
        let cancelled = false

        async function init() {
            setIsInitializing(true)
            setError(null)

            console.log('[TaskAIChat] init() called for task:', taskId)

            try {
                const result = await getOrCreateConversation(taskId, taskTitle)
                console.log('[TaskAIChat] getOrCreateConversation result:', {
                    id: result?.id?.slice(0, 8),
                    error: result?.error,
                    hasResult: !!result,
                })

                if (cancelled) {
                    console.log('[TaskAIChat] init() cancelled after getOrCreateConversation')
                    return
                }

                if (result?.error) {
                    setError(result.error)
                    setIsInitializing(false)
                    return
                }

                if (result?.id) {
                    setConversationId(result.id)

                    // Load existing messages (preserves chat history across open/close)
                    const existingMsgs = await loadMessages(result.id)

                    if (cancelled) {
                        console.log('[TaskAIChat] init() cancelled after loadMessages')
                        return
                    }

                    console.log('[TaskAIChat] Loaded', existingMsgs?.length || 0, 'existing messages')
                    setIsInitializing(false)

                    // Auto-start if requested and no messages exist
                    if (autoStart && existingMsgs && existingMsgs.length === 0 && !autoStartTriggered.current) {
                        autoStartTriggered.current = true

                        let autoMessage = `Please analyze and work on this task based on the title and description provided.`
                        if (taskDescription) {
                            autoMessage = `Please analyze and work on this task:\n\nTitle: ${taskTitle}\nDescription: ${taskDescription}`
                        }

                        setIsSending(true)
                        setMessages([{ role: 'user', content: autoMessage }])

                        try {
                            const sendResult = await sendMessageBackground(result.id, autoMessage)
                            if (sendResult?.error) {
                                setError(sendResult.error)
                                setIsSending(false)
                                return
                            }
                            setIsProcessing(true)
                            startPolling(result.id)
                        } catch (err: any) {
                            setError(err.message || 'Failed to send auto-start message')
                        } finally {
                            setIsSending(false)
                        }
                    } else {
                        inputRef.current?.focus()
                    }
                } else {
                    console.warn('[TaskAIChat] No conversation ID in result:', result)
                    setError('Failed to initialize chat session')
                    setIsInitializing(false)
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('[TaskAIChat] init() error:', err)
                    setError(err.message || 'Failed to initialize')
                    setIsInitializing(false)
                }
            }
        }

        init()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId])

    // When we detect processing state, start polling
    useEffect(() => {
        if (isProcessing && conversationId) {
            startPolling(conversationId)
        }
        return () => {
            if (!isProcessing) stopPolling()
        }
    }, [isProcessing, conversationId, startPolling, stopPolling])

    const handleSend = async (overrideContent?: string) => {
        const content = overrideContent || input.trim()
        if (!content || !conversationId || isSending || isProcessing) return

        if (!overrideContent) setInput('')
        setError(null)
        setIsSending(true)

        // Optimistically add user message
        const userMessage: Message = { role: 'user', content }
        setMessages(prev => [...prev, userMessage])

        try {
            const result = await sendMessageBackground(conversationId, content)

            if (result?.error) {
                setError(result.error)
                setIsSending(false)
                return
            }

            // Message sent successfully — AI is now processing in background
            setIsProcessing(true)
            startPolling(conversationId)
        } catch (err: any) {
            setError(err.message || 'Failed to send message')
        } finally {
            setIsSending(false)
        }
    }

    /**
     * Save AI findings to task and sync to external source
     */
    const handleSaveToTask = async (messageId: string, content: string) => {
        setSavingMessageId(messageId)
        setSyncFeedback((prev) => ({ ...prev, [messageId]: 'saving' }))

        try {
            const result = await saveAiToTask(taskId, content, conversationId || undefined)

            if (result?.error) {
                setSyncFeedback((prev) => ({ ...prev, [messageId]: `Error: ${result.error}` }))
                return
            }

            setSavedMessages((prev) => new Set(prev).add(messageId))

            if (result.sync?.success && result.sync?.provider) {
                setSyncFeedback((prev) => ({
                    ...prev,
                    [messageId]: `Saved & synced to ${result.sync.provider}`,
                }))
            } else if (result.sync?.error) {
                setSyncFeedback((prev) => ({
                    ...prev,
                    [messageId]: `Saved locally (sync failed: ${result.sync.error})`,
                }))
            } else {
                setSyncFeedback((prev) => ({ ...prev, [messageId]: 'Saved to task' }))
            }

        } catch (err: any) {
            setSyncFeedback((prev) => ({ ...prev, [messageId]: `Error: ${err.message}` }))
        } finally {
            setSavingMessageId(null)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        'w-2 h-2 rounded-full',
                        isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-primary animate-pulse',
                    )} />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                        AI Assistant
                    </span>
                    {isProcessing && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                            Processing
                        </span>
                    )}
                    {sourceProvider && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground capitalize">
                            <ExternalLink className="w-2.5 h-2.5 inline mr-0.5" />
                            {sourceProvider}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title={isProcessing ? 'Close — AI will continue in background' : 'Close'}
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                {isInitializing && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        Starting AI session...
                    </div>
                )}

                {!isInitializing && messages.length === 0 && !isProcessing && !error && (
                    <div className="text-center py-4 space-y-2">
                        <BrainCircuit className="w-8 h-8 mx-auto text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                            Type a message or click the play button to let AI analyze this task automatically.
                        </p>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const messageId = msg.id || `msg-${i}`
                    const isSaved = savedMessages.has(messageId)
                    const isSaving = savingMessageId === messageId
                    const feedback = syncFeedback[messageId]
                    const isError = msg.metadata?.error === true

                    // Skip system error messages, show them as error banner instead
                    if (msg.role === 'system' && isError) {
                        return (
                            <div key={messageId} className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                {msg.content}
                            </div>
                        )
                    }

                    if (msg.role === 'system') return null

                    return (
                        <div key={messageId}>
                            <div
                                className={cn(
                                    'text-sm rounded-lg px-4 py-3',
                                    msg.role === 'user'
                                        ? 'bg-primary/15 text-primary ml-auto max-w-[85%]'
                                        : 'bg-accent/30 border border-border',
                                )}
                            >
                                {msg.role === 'assistant' ? (
                                    <div
                                        className="prose-chat break-words text-sm leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:text-sm [&_code]:text-[13px]"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                ) : (
                                    <div className="whitespace-pre-wrap break-words">
                                        {msg.content}
                                    </div>
                                )}
                            </div>
                            {/* Save to task button for assistant messages */}
                            {msg.role === 'assistant' && msg.content.length > 50 && (
                                <div className="flex items-center gap-2 mt-1 ml-1">
                                    {isSaved ? (
                                        <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                                            <CheckCircle className="w-3 h-3" />
                                            {feedback || 'Saved'}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleSaveToTask(messageId, msg.content)}
                                            disabled={isSaving}
                                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                            title="Save findings to task and sync to source"
                                        >
                                            {isSaving ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <FileDown className="w-3 h-3" />
                                            )}
                                            {isSaving ? 'Saving & syncing...' : 'Save to task & sync'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {isProcessing && (
                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <BrainCircuit className="w-3.5 h-3.5 animate-pulse" />
                        <span>
                            AI is thinking in the background...
                            <span className="block text-[10px] text-muted-foreground mt-0.5">
                                You can close this panel. The task will move to &quot;In Review&quot; when ready.
                            </span>
                        </span>
                    </div>
                )}

                {error && (
                    <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
                <div className="flex items-center gap-2">
                    {/* Quick-start button: sends task context without typing */}
                    {messages.length === 0 && !isProcessing && !isSending && conversationId && (
                        <button
                            onClick={() => {
                                const autoMsg = taskDescription
                                    ? `Please analyze and work on this task:\n\nTitle: ${taskTitle}\nDescription: ${taskDescription}`
                                    : `Please analyze and work on this task: "${taskTitle}"`
                                handleSend(autoMsg)
                            }}
                            className="p-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-500 hover:bg-green-500/30 transition-colors shrink-0"
                            title="Start AI with task context (no typing needed)"
                        >
                            <Play className="w-4 h-4" />
                        </button>
                    )}
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isProcessing ? 'Wait for AI to respond...' : 'Ask the AI assistant...'}
                        disabled={isSending || isProcessing || !conversationId}
                        className="flex-1 bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm placeholder-muted-foreground outline-none focus:border-primary/30 transition-colors disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isSending || isProcessing || !conversationId}
                        className="p-2 bg-primary/20 border border-primary/30 rounded-lg text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
