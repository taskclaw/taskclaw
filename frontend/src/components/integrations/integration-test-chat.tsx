'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, BrainCircuit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import {
    createConversation,
    sendMessageBackground,
    getMessages,
} from '@/app/dashboard/chat/actions'

interface Message {
    id?: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at?: string
    metadata?: Record<string, any>
}

interface IntegrationTestChatProps {
    integrationName: string
    connectionId?: string | null
    testConversationId?: string | null
    className?: string
}

export function IntegrationTestChat({
    integrationName,
    connectionId,
    testConversationId,
    className,
}: IntegrationTestChatProps) {
    const [conversationId, setConversationId] = useState<string | null>(testConversationId ?? null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isInitializing, setIsInitializing] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, isProcessing, scrollToBottom])

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
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    created_at: m.created_at,
                    metadata: m.metadata,
                }))
                setMessages(msgs)

                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg && lastMsg.role === 'user') {
                    setIsProcessing(true)
                } else {
                    setIsProcessing(false)
                    stopPolling()
                }
                return msgs
            }
        } catch (err) {
            console.error('[IntegrationTestChat] Failed to load messages:', err)
        }
        return []
    }, [stopPolling])

    const startPolling = useCallback((convId: string) => {
        stopPolling()
        pollTimerRef.current = setInterval(() => {
            loadMessages(convId)
        }, 5000)
    }, [stopPolling, loadMessages])

    useEffect(() => {
        return () => stopPolling()
    }, [stopPolling])

    // Initialize conversation
    useEffect(() => {
        let cancelled = false

        async function init() {
            setIsInitializing(true)
            setError(null)

            try {
                // If we already have a test conversation, reuse it
                if (testConversationId) {
                    setConversationId(testConversationId)
                    await loadMessages(testConversationId)
                    if (cancelled) return
                    setIsInitializing(false)
                    inputRef.current?.focus()
                    return
                }

                // Create a standalone conversation (no task_id) for integration testing
                const result = await createConversation(
                    `Integration Test: ${integrationName}`
                )

                if (cancelled) return

                if (result?.error) {
                    setError(result.error)
                    setIsInitializing(false)
                    return
                }

                if (result?.id) {
                    setConversationId(result.id)
                    setIsInitializing(false)
                    inputRef.current?.focus()
                } else {
                    setError('Failed to initialize test chat')
                    setIsInitializing(false)
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Failed to initialize')
                    setIsInitializing(false)
                }
            }
        }

        init()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId, integrationName])

    useEffect(() => {
        if (isProcessing && conversationId) {
            startPolling(conversationId)
        }
        return () => {
            if (!isProcessing) stopPolling()
        }
    }, [isProcessing, conversationId, startPolling, stopPolling])

    const handleSend = async () => {
        const content = input.trim()
        if (!content || !conversationId || isSending || isProcessing) return

        setInput('')
        setError(null)
        setIsSending(true)

        const userMessage: Message = { role: 'user', content }
        setMessages((prev) => [...prev, userMessage])

        try {
            const result = await sendMessageBackground(conversationId, content)

            if (result?.error) {
                setError(result.error)
                setIsSending(false)
                return
            }

            setIsProcessing(true)
            startPolling(conversationId)
        } catch (err: any) {
            setError(err.message || 'Failed to send message')
        } finally {
            setIsSending(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className={cn('flex flex-col h-full overflow-hidden border rounded-lg bg-background', className)}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-border">
                <div className={cn(
                    'w-2 h-2 rounded-full',
                    isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-primary animate-pulse',
                )} />
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Test Chat
                </span>
                {isProcessing && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                        Processing
                    </span>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {isInitializing && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        Starting test session...
                    </div>
                )}

                {!isInitializing && messages.length === 0 && !isProcessing && !error && (
                    <div className="text-center py-4 space-y-1">
                        <BrainCircuit className="w-6 h-6 mx-auto text-muted-foreground/30" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                            Test your {integrationName} integration by asking the AI to verify connectivity.
                        </p>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const messageId = msg.id || `msg-${i}`
                    const isError = msg.metadata?.error === true

                    if (msg.role === 'system' && isError) {
                        return (
                            <div key={messageId} className="text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5">
                                {msg.content}
                            </div>
                        )
                    }

                    if (msg.role === 'system') return null

                    return (
                        <div
                            key={messageId}
                            className={cn(
                                'text-xs rounded-lg px-3 py-2',
                                msg.role === 'user'
                                    ? 'bg-primary/15 text-primary ml-auto max-w-[85%]'
                                    : 'bg-accent/30 border border-border',
                            )}
                        >
                            {msg.role === 'assistant' ? (
                                <div
                                    className="prose-chat break-words text-xs leading-relaxed [&_strong]:font-semibold [&_li]:text-xs [&_code]:text-[11px]"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                />
                            ) : (
                                <div className="whitespace-pre-wrap break-words">
                                    {msg.content}
                                </div>
                            )}
                        </div>
                    )
                })}

                {isProcessing && (
                    <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
                        <BrainCircuit className="w-3 h-3 animate-pulse" />
                        AI is thinking...
                    </div>
                )}

                {error && (
                    <div className="text-[10px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5">
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2 border-t border-border">
                <div className="flex items-center gap-1.5">
                    <Input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isProcessing ? 'Wait for response...' : 'Test the integration...'}
                        disabled={isSending || isProcessing || !conversationId}
                        className="flex-1 h-8 text-xs"
                    />
                    <Button
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleSend}
                        disabled={!input.trim() || isSending || isProcessing || !conversationId}
                    >
                        <Send className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
