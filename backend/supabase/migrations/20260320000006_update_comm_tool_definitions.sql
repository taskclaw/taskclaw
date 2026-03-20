-- ═══════════════════════════════════════════════════════════
-- Update Communication Tool Definitions
-- ═══════════════════════════════════════════════════════════
-- Adds detailed setup guides with OpenClaw configuration steps
-- and optional config_fields for each comm tool definition.
-- These tools are configured on the OpenClaw side (auth_type stays 'none'),
-- but users need clear guidance on how to set them up in OpenClaw.

-- ============================================================================
-- Telegram: update setup_guide and config_fields
-- ============================================================================
UPDATE public.integration_definitions
SET
  setup_guide = $guide$## Setup Guide: Telegram Bot

Telegram messaging is powered by a Telegram Bot configured in your OpenClaw instance.

### Step 1: Create a Telegram Bot
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to name your bot
3. Copy the **Bot Token** (format: `123456789:ABCdefGhIjKlmNoPqRsTuVwXyZ`)

### Step 2: Configure in OpenClaw
1. Open your OpenClaw admin panel
2. Go to **Integrations** → **Telegram**
3. Paste your Bot Token
4. Set the webhook URL or enable polling mode
5. Save and verify the connection shows "Connected"

### Step 3: Enable in TaskClaw
1. Toggle this integration **ON**
2. The health check will verify your bot is reachable
3. Test by asking the AI to "Send a test message on Telegram"

### Troubleshooting
- **Unhealthy status**: Check that the bot token is valid and the OpenClaw Telegram service is running
- **Messages not delivering**: Ensure the bot has been added to the target chat/group
- **Rate limits**: Telegram allows ~30 messages/second to different chats$guide$,
  config_fields = '[
    {"key": "default_chat_id", "label": "Default Chat ID", "type": "text", "required": false, "placeholder": "-1001234567890", "help_text": "Optional. The default Telegram chat/group ID for outgoing messages."},
    {"key": "bot_username", "label": "Bot Username", "type": "text", "required": false, "placeholder": "@MyTaskClawBot", "help_text": "Optional. The bot''s @username for reference."}
  ]'::jsonb
WHERE slug = 'telegram-comm';

-- ============================================================================
-- WhatsApp: update setup_guide and config_fields
-- ============================================================================
UPDATE public.integration_definitions
SET
  setup_guide = $guide$## Setup Guide: WhatsApp Business API

WhatsApp messaging is powered by the WhatsApp Business API configured in your OpenClaw instance.

### Step 1: Set Up WhatsApp Business API
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select a **Meta Business App**
3. Add the **WhatsApp** product to your app
4. In **WhatsApp** → **API Setup**, note your:
   - **Phone Number ID**
   - **WhatsApp Business Account ID**
   - **Permanent Access Token** (generate under System Users)

### Step 2: Configure in OpenClaw
1. Open your OpenClaw admin panel
2. Go to **Integrations** → **WhatsApp**
3. Enter your Phone Number ID, Business Account ID, and Access Token
4. Configure the webhook URL for incoming messages
5. Save and verify the connection

### Step 3: Enable in TaskClaw
1. Toggle this integration **ON**
2. The health check will verify the WhatsApp API is reachable
3. Test by asking the AI to "Send a test WhatsApp message"

### Important Notes
- **Template messages**: First-time outreach requires a pre-approved template message
- **24-hour window**: After a user messages you, free-form replies are allowed for 24 hours
- **Phone format**: Numbers must include country code without '+' (e.g., `15551234567`)
- **Template approval**: Templates are managed in Meta Business Suite → WhatsApp Manager$guide$,
  config_fields = '[
    {"key": "default_phone", "label": "Default Phone Number", "type": "text", "required": false, "placeholder": "15551234567", "help_text": "Optional. Default recipient phone number (with country code, no + prefix)."},
    {"key": "default_template", "label": "Default Template Name", "type": "text", "required": false, "placeholder": "hello_world", "help_text": "Optional. Default message template name for first-contact messages."}
  ]'::jsonb
WHERE slug = 'whatsapp-comm';

-- ============================================================================
-- Slack: update setup_guide and config_fields
-- ============================================================================
UPDATE public.integration_definitions
SET
  setup_guide = $guide$## Setup Guide: Slack Bot

Slack messaging is powered by a Slack App/Bot configured in your OpenClaw instance.

### Step 1: Create a Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name your app (e.g., "TaskClaw AI") and select your workspace
4. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `chat:write` — Post messages
   - `chat:write.public` — Post to channels without joining
   - `users:read` — Look up user info
   - `channels:read` — List channels
5. Click **Install to Workspace** and authorize
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 2: Configure in OpenClaw
1. Open your OpenClaw admin panel
2. Go to **Integrations** → **Slack**
3. Paste your Bot User OAuth Token
4. Optionally configure the Signing Secret for webhook verification
5. Save and verify the connection

### Step 3: Enable in TaskClaw
1. Toggle this integration **ON**
2. The health check will verify the Slack bot is reachable
3. Test by asking the AI to "Send a test message to Slack"

### Troubleshooting
- **Unhealthy status**: Check that the bot token is valid and hasn't been revoked
- **"not_in_channel" errors**: Invite the bot to the channel first (`/invite @BotName`)
- **Missing permissions**: Reinstall the app after adding new scopes$guide$,
  config_fields = '[
    {"key": "default_channel", "label": "Default Channel", "type": "text", "required": false, "placeholder": "#general", "help_text": "Optional. Default Slack channel for outgoing messages (e.g., #general or C01234ABCDE)."},
    {"key": "bot_name", "label": "Bot Display Name", "type": "text", "required": false, "placeholder": "TaskClaw AI", "help_text": "Optional. How the bot appears in Slack messages."}
  ]'::jsonb
WHERE slug = 'slack-comm';
