import { redirect } from 'next/navigation'

/**
 * OpenClaw Settings have moved to the AI Backbones page.
 * OpenClaw-specific credentials (OpenRouter, Brave Search, Telegram) are now
 * configured via the backbone connection dialog when editing an OpenClaw connection.
 */
export default function AiProviderSettingsPage() {
    redirect('/dashboard/settings/backbones')
}
