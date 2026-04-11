'use client'

import { use, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { usePod } from '@/hooks/use-pods'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
    MessageCircle,
    Plus,
    Send,
    Loader2,
    Layers,
} from 'lucide-react'
import {
    getConversations as loadConversationsAction,
    getMessages as loadMessagesAction,
    createConversation as createConversationAction,
    sendMessage as sendMessageAction,
    deleteConversation as deleteConversationAction,
} from '@/app/dashboard/chat/actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Conversation {
    id: string
    title: string
    pod_id?: string
    created_at: string
    updated_at: string
}

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    created_at: string
}

export default function PodChatPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const router = useRouter()
    const { data: pod, isLoading: podLoading } = usePod(slug)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const [conversations, setConversations] = useState<Conversation[]>([])
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [inputMessage, setInputMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [loadingMessages, setLoadingMessages] = useState(false)

    // Load conversations on mount
    useEffect(() => {
        if (pod) {
            loadConversations()
        }
    }, [pod?.id])

    useEffect(() => {
        if (currentConversation) {
            loadMessages(currentConversation.id)
        } else {
            setMessages([])
        }
    }, [currentConversation])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const loadConversations = async () => {
        try {
            setLoading(true)
            const result = await loadConversationsAction()
            // Filter to only pod conversations
            const podConvos = (result.data || []).filter(
                (c: any) => c.pod_id === pod?.id
            )
            setConversations(podConvos)

            if (podConvos.length > 0 && !currentConversation) {
                setCurrentConversation(podConvos[0])
            }
        } catch (error) {
            console.error('Failed to load conversations:', error)
        } finally {
            setLoading(false)
        }
    }

    const loadMessages = async (conversationId: string) => {
        try {
            setLoadingMessages(true)
            const result = await loadMessagesAction(conversationId)
            setMessages(result.data || [])
        } catch (error) {
            console.error('Failed to load messages:', error)
        } finally {
            setLoadingMessages(false)
        }
    }

    const createConversation = async () => {
        if (!pod) return
        try {
            const result = await createConversationAction(`Pod Chat: ${pod.name}`, undefined, undefined, pod.id)
            if (result.error) {
                toast.error(result.error)
                return
            }
            setConversations([result, ...conversations])
            setCurrentConversation(result)
        } catch (error) {
            toast.error('Failed to create conversation')
        }
    }

    const sendMessage = async () => {
        if (!inputMessage.trim() || !currentConversation) return

        const userMessageContent = inputMessage.trim()
        setInputMessage('')
        setSending(true)

        const tempUserMessage: Message = {
            id: 'temp-' + Date.now(),
            role: 'user',
            content: userMessageContent,
            created_at: new Date().toISOString(),
        }
        setMessages([...messages, tempUserMessage])

        try {
            const result = await sendMessageAction(currentConversation.id, userMessageContent)

            if (result.error) {
                setMessages(messages)
                toast.error('Failed to send message')
            } else {
                setMessages([...messages, result.userMessage, result.assistantMessage])
            }
        } catch (error) {
            setMessages(messages)
            toast.error('Network error')
        } finally {
            setSending(false)
        }
    }

    if (podLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    if (!pod) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Layers className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Pod not found</h2>
                <Button onClick={() => router.push('/dashboard/cockpit')}>Back to Cockpit</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 -m-4 -mt-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2 px-4">
                <div className="flex items-center gap-2 flex-1">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href="/dashboard/cockpit">Cockpit</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/dashboard/pods/${slug}`}>{pod.name}</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Chat</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </header>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <div className="w-72 border-r flex flex-col bg-muted/30">
                    <div className="p-3 border-b">
                        <Button onClick={createConversation} className="w-full" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            New Chat
                        </Button>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {loading ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
                            ) : conversations.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No conversations yet.
                                </div>
                            ) : (
                                conversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setCurrentConversation(conv)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCurrentConversation(conv) }}
                                        className={cn(
                                            'w-full text-left p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer',
                                            currentConversation?.id === conv.id && 'bg-accent border border-accent-foreground/20',
                                        )}
                                    >
                                        <div className="font-medium truncate text-sm">{conv.title}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {new Date(conv.updated_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Chat area */}
                <div className="flex-1 flex flex-col">
                    {currentConversation ? (
                        <>
                            <ScrollArea className="flex-1 p-4">
                                {loadingMessages ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                        <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
                                        <p className="text-lg mb-2">Start a conversation</p>
                                        <p className="text-sm">Chat with the {pod.name} pod AI assistant</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-w-4xl mx-auto">
                                        {messages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[80%] rounded-lg p-4 ${
                                                        msg.role === 'user'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                    }`}
                                                >
                                                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                                                    <div className={`text-xs mt-2 ${
                                                        msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                                    }`}>
                                                        {new Date(msg.created_at).toLocaleTimeString()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </ScrollArea>

                            <div className="p-4 border-t bg-background">
                                <div className="max-w-4xl mx-auto flex gap-2">
                                    <Input
                                        value={inputMessage}
                                        onChange={(e) => setInputMessage(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                sendMessage()
                                            }
                                        }}
                                        placeholder={`Message ${pod.name}...`}
                                        disabled={sending}
                                        className="flex-1"
                                    />
                                    <Button onClick={sendMessage} disabled={sending || !inputMessage.trim()}>
                                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <MessageCircle className="h-24 w-24 mb-6 opacity-20" />
                            <h2 className="text-2xl font-semibold mb-2">{pod.name} Chat</h2>
                            <p className="text-center max-w-md mb-6">
                                Chat with the AI assistant for this pod. Select or create a conversation to begin.
                            </p>
                            <Button onClick={createConversation}>
                                <Plus className="h-4 w-4 mr-2" />
                                Start New Conversation
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
