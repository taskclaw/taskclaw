'use client'

import { useState } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { addBoardIntegration } from '@/app/dashboard/boards/actions'
import { toast } from 'sonner'
import type { ManifestIntegration } from '@/types/board'

// ─── Common Integration Catalog ──────────────────────────────

const INTEGRATION_CATALOG: ManifestIntegration[] = [
    {
        slug: 'x-api',
        name: 'X (Twitter) API',
        description: 'Publish posts, threads, and polls directly to X. Read analytics and engagement metrics.',
        icon: '𝕏',
        required: true,
        setup_guide: '1. Go to developer.x.com and create a project & app.\n2. Generate API Key, API Secret, Access Token, and Access Token Secret.\n3. Make sure your app has Read and Write permissions.\n4. Paste the credentials below.',
        config_fields: [
            { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'xAI_xxxxx', help_text: 'Found in X Developer Portal → Keys and Tokens' },
            { key: 'api_secret', label: 'API Secret', type: 'password', required: true, placeholder: 'xxxxxxxxxxxxxxxx' },
            { key: 'access_token', label: 'Access Token', type: 'password', required: true, placeholder: 'xxxxxxxx-xxxxxxxx' },
            { key: 'access_token_secret', label: 'Access Token Secret', type: 'password', required: true, placeholder: 'xxxxxxxxxxxxxxxx' },
        ],
    },
    {
        slug: 'nano-banana',
        name: 'Nano Banana',
        description: 'AI image generation for visual content. Create custom graphics, quote cards, infographics, and social media images.',
        icon: '🍌',
        required: false,
        setup_guide: '1. Sign up at nanobanana.com.\n2. Go to Settings → API Keys.\n3. Generate a new API key and paste it below.',
        config_fields: [
            { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'nb_xxxxxxxxxxxxx', help_text: 'Your Nano Banana API key for image generation' },
        ],
    },
    {
        slug: 'linkedin-api',
        name: 'LinkedIn API',
        description: 'Share posts, articles, and updates to LinkedIn profiles and company pages.',
        icon: '💼',
        required: false,
        setup_guide: '1. Go to linkedin.com/developers and create an app.\n2. Request the "Share on LinkedIn" product.\n3. Generate an Access Token with w_member_social scope.\n4. Paste the token below.',
        config_fields: [
            { key: 'access_token', label: 'Access Token', type: 'password', required: true, placeholder: 'AQV...', help_text: 'OAuth 2.0 access token with w_member_social scope' },
        ],
    },
    {
        slug: 'instagram-api',
        name: 'Instagram API',
        description: 'Publish photos, reels, and stories to Instagram business accounts via the Graph API.',
        icon: '📸',
        required: false,
        setup_guide: '1. Create a Facebook App at developers.facebook.com.\n2. Add the Instagram Graph API product.\n3. Connect your Instagram Business account.\n4. Generate a long-lived access token.',
        config_fields: [
            { key: 'access_token', label: 'Access Token', type: 'password', required: true, placeholder: 'EAAG...', help_text: 'Long-lived token from Facebook Developer Portal' },
            { key: 'ig_user_id', label: 'Instagram User ID', type: 'text', required: true, placeholder: '17841400...', help_text: 'Your Instagram Business Account ID' },
        ],
    },
    {
        slug: 'openai-api',
        name: 'OpenAI API',
        description: 'Generate images with DALL-E, use GPT for text processing, or access other OpenAI models.',
        icon: '🤖',
        required: false,
        setup_guide: '1. Go to platform.openai.com and sign in.\n2. Navigate to API Keys.\n3. Create a new secret key and paste it below.',
        config_fields: [
            { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...', help_text: 'Your OpenAI API key' },
        ],
    },
    {
        slug: 'sendgrid',
        name: 'SendGrid',
        description: 'Send transactional and marketing emails via the SendGrid API.',
        icon: '📧',
        required: false,
        setup_guide: '1. Sign up at sendgrid.com.\n2. Go to Settings → API Keys.\n3. Create a key with Mail Send permissions.\n4. Paste it below.',
        config_fields: [
            { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'SG.xxxxx', help_text: 'SendGrid API key with Mail Send permissions' },
            { key: 'from_email', label: 'From Email', type: 'text', required: true, placeholder: 'hello@yourdomain.com', help_text: 'Verified sender email address' },
        ],
    },
    {
        slug: 'slack-webhook',
        name: 'Slack',
        description: 'Send notifications and messages to Slack channels via incoming webhooks.',
        icon: '💬',
        required: false,
        setup_guide: '1. Go to api.slack.com/apps and create a new app.\n2. Enable Incoming Webhooks.\n3. Add a webhook to your workspace and select a channel.\n4. Copy the webhook URL below.',
        config_fields: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/...', help_text: 'Incoming webhook URL for your channel' },
        ],
    },
    {
        slug: 'hubspot-api',
        name: 'HubSpot',
        description: 'Sync contacts, deals, and companies with HubSpot CRM.',
        icon: '🔶',
        required: false,
        setup_guide: '1. Go to HubSpot → Settings → Integrations → Private Apps.\n2. Create a new private app.\n3. Grant the required scopes (contacts, deals).\n4. Copy the access token below.',
        config_fields: [
            { key: 'access_token', label: 'Access Token', type: 'password', required: true, placeholder: 'pat-...', help_text: 'Private app access token from HubSpot' },
        ],
    },
    {
        slug: 'stripe-api',
        name: 'Stripe',
        description: 'Process payments, manage subscriptions, and handle billing via the Stripe API.',
        icon: '💳',
        required: false,
        setup_guide: '1. Go to dashboard.stripe.com → Developers → API keys.\n2. Copy your Secret key (use test key for development).\n3. Paste it below.',
        config_fields: [
            { key: 'secret_key', label: 'Secret Key', type: 'password', required: true, placeholder: 'sk_live_...', help_text: 'Stripe secret key (starts with sk_live_ or sk_test_)' },
        ],
    },
    {
        slug: 'webhook-generic',
        name: 'Custom Webhook',
        description: 'Send data to any external service via a custom webhook URL.',
        icon: '🔗',
        required: false,
        setup_guide: 'Provide the URL of your webhook endpoint. TaskClaw will send POST requests with JSON payloads.',
        config_fields: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://your-service.com/webhook' },
            { key: 'auth_header', label: 'Authorization Header', type: 'password', required: false, placeholder: 'Bearer xxx', help_text: 'Optional auth header sent with each request' },
        ],
    },
]

// ─── Component ──────────────────────────────

interface AddIntegrationDialogProps {
    boardId: string
    existingSlugs: string[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdded: () => void
}

export function AddIntegrationDialog({
    boardId,
    existingSlugs,
    open,
    onOpenChange,
    onAdded,
}: AddIntegrationDialogProps) {
    const [search, setSearch] = useState('')
    const [adding, setAdding] = useState<string | null>(null)

    const filtered = INTEGRATION_CATALOG.filter(
        (i) =>
            !existingSlugs.includes(i.slug) &&
            (i.name.toLowerCase().includes(search.toLowerCase()) ||
                i.description.toLowerCase().includes(search.toLowerCase()))
    )

    const handleAdd = async (integration: ManifestIntegration) => {
        setAdding(integration.slug)
        try {
            const result = await addBoardIntegration(boardId, integration)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${integration.name} added to board`)
                onAdded()
                onOpenChange(false)
            }
        } catch {
            toast.error('Failed to add integration')
        } finally {
            setAdding(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-sm">Add Integration</DialogTitle>
                    <DialogDescription className="text-xs">
                        Connect external services to this board. You can configure credentials after adding.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search integrations..."
                        className="pl-9 h-9 text-sm"
                    />
                </div>

                <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
                    {filtered.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            {search ? 'No integrations match your search.' : 'All available integrations have been added.'}
                        </div>
                    ) : (
                        <div className="space-y-1 py-1">
                            {filtered.map((integration) => (
                                <button
                                    key={integration.slug}
                                    onClick={() => handleAdd(integration)}
                                    disabled={adding !== null}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
                                >
                                    <span className="text-xl shrink-0">{integration.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold">{integration.name}</p>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                                            {integration.description}
                                        </p>
                                    </div>
                                    {adding === integration.slug ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
                                            <Plus className="w-3 h-3" />
                                            Add
                                        </Badge>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
