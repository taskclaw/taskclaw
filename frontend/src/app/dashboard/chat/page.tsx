'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MessageCircle,
  Plus,
  Send,
  Loader2,
  Settings,
  Trash2,
  Edit2,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getConversations as loadConversationsAction,
  getMessages as loadMessagesAction,
  createConversation as createConversationAction,
  sendMessage as sendMessageAction,
  deleteConversation as deleteConversationAction,
  updateConversationTitle as updateTitleAction,
} from './actions';
import { getAiProviderConfig } from '@/app/dashboard/settings/ai-provider/actions';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  task_id?: string;
  created_at: string;
  updated_at: string;
  task?: {
    id: string;
    title: string;
    status: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: any;
}

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load conversations and check AI config on mount
  useEffect(() => {
    loadConversations();
    checkAiConfig();
  }, []);

  const checkAiConfig = async () => {
    try {
      const config = await getAiProviderConfig();
      setAiConfigured(config !== null && config?.api_url && config?.is_active);
    } catch {
      setAiConfigured(false);
    }
  };

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id);
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const result = await loadConversationsAction();
      setConversations(result.data || []);
      
      // Auto-select first conversation if exists
      if (result.data && result.data.length > 0 && !currentConversation) {
        setCurrentConversation(result.data[0]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const result = await loadMessagesAction(conversationId);
      setMessages(result.data || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const createConversation = async () => {
    try {
      setSendError(null);
      const result = await createConversationAction();
      
      if (result.error) {
        setSendError('Failed to create conversation: ' + result.error);
        return;
      }
      
      setConversations([result, ...conversations]);
      setCurrentConversation(result);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setSendError('Failed to create conversation. Please try again.');
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentConversation) return;

    const userMessageContent = inputMessage.trim();
    setInputMessage('');
    setSending(true);
    setSendError(null);

    // Optimistic UI update
    const tempUserMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessageContent,
      created_at: new Date().toISOString(),
    };
    setMessages([...messages, tempUserMessage]);

    try {
      const result = await sendMessageAction(currentConversation.id, userMessageContent);

      if (result.error) {
        // Remove optimistic message on error
        setMessages(messages);
        setSendError('Failed to send message. Please check your AI provider configuration.');
      } else {
        // Replace temp message with real messages
        setMessages([...messages, result.userMessage, result.assistantMessage]);
        
        // Update conversation list (move to top if needed)
        await loadConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(messages);
      setSendError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const result = await deleteConversationAction(deleteTarget);

      if (result.error) {
        toast.error('Failed to delete conversation: ' + result.error);
      } else {
        setDeleteTarget(null);
        setDeletingId(deleteTarget);
        setTimeout(() => {
          setConversations((prev) => prev.filter((c) => c.id !== deleteTarget));
          if (currentConversation?.id === deleteTarget) {
            setCurrentConversation(conversations.find((c) => c.id !== deleteTarget) || null);
          }
          setDeletingId(null);
          toast.success('Conversation deleted');
        }, 500);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Conversations List */}
      <div className="w-80 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Conversations</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push('/dashboard/settings/ai-provider')}
              title="AI Provider Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={createConversation} className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No conversations yet.
                <br />
                Click "New Chat" to start!
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setCurrentConversation(conv)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg hover:bg-accent transition-colors',
                    currentConversation?.id === conv.id && 'bg-accent border border-accent-foreground/20',
                    deletingId === conv.id && 'animate-deleting',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">
                        {conv.title}
                      </div>
                      {conv.task && (
                        <div className="text-xs text-muted-foreground truncate">
                          Task: {conv.task.title}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
          onConfirm={confirmDeleteConversation}
          title="Delete conversation?"
          description="This conversation and all its messages will be permanently deleted."
          loading={deleteLoading}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* AI Provider not configured banner */}
        {aiConfigured === false && (
          <Alert variant="destructive" className="m-4 mb-0 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                AI Assistant not configured. Go to{' '}
                <Link href="/dashboard/settings/ai-provider" className="font-medium underline underline-offset-4 hover:text-amber-900 dark:hover:text-amber-300">
                  Settings &rarr; AI Provider
                </Link>{' '}
                to set up your AI connection.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Inline error banner for send/create errors */}
        {sendError && (
          <Alert variant="destructive" className="m-4 mb-0">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{sendError}</span>
              <Button variant="ghost" size="sm" onClick={() => setSendError(null)} className="shrink-0">
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {currentConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">
                    {currentConversation.title}
                  </h1>
                  {currentConversation.task && (
                    <p className="text-sm text-muted-foreground">
                      Linked to task: {currentConversation.task.title}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const newTitle = prompt(
                      'Enter new title:',
                      currentConversation.title
                    );
                    if (newTitle && currentConversation) {
                      const result = await updateTitleAction(currentConversation.id, newTitle);
                      if (!result.error) {
                        setCurrentConversation({ ...currentConversation, title: newTitle });
                        await loadConversations();
                      }
                    }
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Rename
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
                  <p className="text-lg mb-2">Start a conversation</p>
                  <p className="text-sm">
                    Ask questions, get help with your tasks, or chat about anything!
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : msg.role === 'system'
                            ? 'bg-destructive/10 text-destructive border border-destructive/20'
                            : 'bg-muted'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        <div
                          className={`text-xs mt-2 ${
                            msg.role === 'user'
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t bg-background">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type your message... (Shift+Enter for new line)"
                  disabled={sending}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={sending || !inputMessage.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="h-24 w-24 mb-6 opacity-20" />
            <h2 className="text-2xl font-semibold mb-2">Welcome to AI Chat</h2>
            <p className="text-center max-w-md mb-6">
              Select a conversation from the sidebar or create a new one to get started.
            </p>
            <Button onClick={createConversation}>
              <Plus className="h-4 w-4 mr-2" />
              Start New Conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
