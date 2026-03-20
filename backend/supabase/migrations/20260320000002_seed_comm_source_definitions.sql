-- ═══════════════════════════════════════════════════════════
-- Integration Unification: Seed Communication & Source Definitions
-- ═══════════════════════════════════════════════════════════
-- Adds 5 new system integration definitions + 5 linked skills:
--   - 2 source integrations: Notion Source, ClickUp Source
--   - 3 communication tools: Telegram, WhatsApp, Slack (OpenClaw-side, auth_type: 'none')
--
-- Continues from existing IDs 01-17 (skills: a1000000-..., definitions: b1000000-...)
-- New IDs: 18-22
--
-- NOTE: The existing marketplace already has 'slack', 'telegram', 'whatsapp' slugs
-- for API integrations (with credentials). These NEW definitions are DIFFERENT:
--   - telegram-comm, whatsapp-comm, slack-comm (OpenClaw comm tools, no credentials)
--   - notion-source, clickup-source (task sync adapters)

-- ============================================================================
-- Step 1: Insert 5 new Skills (skill_type = 'integration')
-- ============================================================================

-- 18. Notion Task Sync Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000018',
  NULL,
  'Notion Task Sync',
  'Teaches OpenClaw how the Notion source adapter works for bidirectional task synchronization with Notion databases.',
  $instructions$# Notion Task Sync — Source Adapter

## Overview
The Notion Source Adapter syncs tasks bidirectionally between TaskClaw and Notion databases. Tasks in a connected Notion database are automatically imported into TaskClaw, and changes made in TaskClaw can be pushed back to Notion.

## How It Works
1. The user connects a Notion integration token and shares a database with it.
2. TaskClaw periodically queries the Notion database for new or updated pages.
3. Each Notion page is mapped to a TaskClaw task using the field mapping below.
4. Changes to task status, priority, or notes in TaskClaw are synced back to the Notion page.

## Field Mapping
| TaskClaw Field | Notion Property | Notion Type  | Notes                                      |
|---------------|-----------------|-------------|---------------------------------------------|
| title         | Title           | title       | The page title (every DB has exactly one)   |
| status        | Status          | status      | Maps to TaskClaw statuses (To-Do, In Progress, Done) |
| priority      | Priority        | select      | Maps: High, Medium, Low                     |
| notes         | Notes / Description | rich_text | Rich text content from the page body        |
| due_date      | Due Date        | date        | Date or date range (uses start date)        |
| external_id   | Page ID         | -           | Notion page UUID for deduplication          |
| external_url  | Page URL        | -           | Direct link to the Notion page              |

## Sync Behavior
- **Sync Interval**: Configurable (default: 30 minutes). The adapter polls the Notion database at this interval.
- **Initial Sync**: On first connection, all existing pages matching the filter are imported.
- **Incremental Sync**: Subsequent syncs only fetch pages modified since `last_synced_at`.
- **Conflict Resolution**: TaskClaw uses last-write-wins — the most recently modified version takes precedence.
- **Deduplication**: Uses `external_id` (Notion page UUID) to prevent duplicate task creation.

## Sync Status
- **idle**: No sync in progress. Last sync completed successfully.
- **syncing**: A sync operation is currently running.
- **error**: The last sync failed. Check `last_sync_error` for details.
- **disabled**: Sync is turned off by the user.

## Explaining to Users
- "Your Notion tasks sync automatically every X minutes."
- "If a task was just created in Notion, it may take up to X minutes to appear in TaskClaw."
- "You can trigger a manual sync from the source settings."
- "If sync shows an error, check that the Notion integration still has access to the database."
- "Changes you make to task status or priority in TaskClaw will be reflected in Notion on the next sync."
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 19. ClickUp Task Sync Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000019',
  NULL,
  'ClickUp Task Sync',
  'Teaches OpenClaw how the ClickUp source adapter works for syncing tasks from ClickUp lists into TaskClaw.',
  $instructions$# ClickUp Task Sync — Source Adapter

## Overview
The ClickUp Source Adapter syncs tasks from ClickUp lists into TaskClaw. Tasks in a connected ClickUp list are automatically imported and kept up to date based on the configured sync interval.

## How It Works
1. The user provides a ClickUp API token (personal token from Settings > Apps).
2. The user selects a Space, Folder, and List to sync from.
3. TaskClaw periodically fetches tasks from the selected ClickUp list.
4. Each ClickUp task is mapped to a TaskClaw task using the field mapping below.

## ClickUp Hierarchy
ClickUp organizes work in a hierarchy:
- **Workspace** (top level, linked to API token)
  - **Space** (team or department)
    - **Folder** (project grouping, optional)
      - **List** (the actual task container)

The source adapter syncs at the **List** level. Users select which list to sync.

## Field Mapping
| TaskClaw Field | ClickUp Field   | Notes                                              |
|---------------|----------------|----------------------------------------------------|
| title         | name           | Task name                                           |
| status        | status         | Maps ClickUp statuses to TaskClaw (To-Do, In Progress, Done) |
| priority      | priority       | ClickUp uses 1-4: 1=Urgent→High, 2=High→High, 3=Normal→Medium, 4=Low→Low |
| notes         | description    | Plain text or markdown description                  |
| due_date      | due_date       | Unix timestamp (milliseconds) converted to ISO date |
| external_id   | id             | ClickUp task ID for deduplication                   |
| external_url  | url            | Direct link to the ClickUp task                     |

## Priority Mapping
| ClickUp Priority | ClickUp Value | TaskClaw Priority |
|-----------------|---------------|-------------------|
| Urgent          | 1             | High              |
| High            | 2             | High              |
| Normal          | 3             | Medium            |
| Low             | 4             | Low               |

## Sync Behavior
- **Sync Interval**: Configurable (default: 30 minutes).
- **Initial Sync**: Imports all tasks from the selected list.
- **Incremental Sync**: Fetches tasks modified since `last_synced_at` using ClickUp's `date_updated_gt` filter.
- **Deduplication**: Uses `external_id` (ClickUp task ID) to prevent duplicates.
- **Subtasks**: Top-level tasks are synced. Subtasks can optionally be included via config.

## Sync Status
- **idle**: No sync in progress.
- **syncing**: Sync operation is running.
- **error**: Last sync failed (e.g., invalid API token, list not found).
- **disabled**: Sync turned off by user.

## Explaining to Users
- "Your ClickUp tasks sync automatically from the selected list every X minutes."
- "Tasks are imported from the list level — select a Space, Folder, and List to sync."
- "Priority mapping: ClickUp Urgent/High become TaskClaw High, Normal becomes Medium, Low stays Low."
- "If sync fails, verify your API token is still valid in ClickUp Settings > Apps."
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 20. Telegram Communication Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000020',
  NULL,
  'Telegram Communication',
  'Teaches OpenClaw that Telegram is available as a communication tool, configured on the OpenClaw side.',
  $instructions$# Telegram Communication Tool

## Overview
Telegram communication is configured on the OpenClaw side. When this integration is enabled, it declares that Telegram is available as a communication channel for the AI assistant. OpenClaw can send messages to Telegram chats using its built-in Telegram bot integration.

## How It Works
- This is NOT an API integration with credentials stored in TaskClaw.
- The Telegram bot is configured directly in the OpenClaw instance.
- Enabling this integration tells the AI assistant that Telegram is available for sending messages.
- The AI will check the health status before attempting to send messages.

## Capabilities
- Send text messages to Telegram chats and groups
- Format messages using HTML or MarkdownV2 parse modes
- Send messages with inline keyboard buttons for interactive responses
- Send photos, documents, and other media
- Bot commands can be configured on the OpenClaw side

## Message Formatting
### HTML (recommended)
```html
<b>bold</b>, <i>italic</i>, <u>underline</u>
<a href="https://example.com">link</a>
<code>inline code</code>
<pre>code block</pre>
```

### MarkdownV2
```
*bold*, _italic_, __underline__
[link](https://example.com)
`inline code`
```

## Health Monitoring
- The system periodically checks if the Telegram bot is reachable and responsive.
- **healthy**: Bot is connected and responsive. Messages can be sent.
- **unhealthy**: Bot is not responding. Messages will fail. Check OpenClaw Telegram configuration.
- **checking**: A health check is currently in progress.
- **unknown**: Health has not been checked yet.

## Important Notes
- The tool must be enabled AND healthy before the AI attempts to send messages.
- If health status is unhealthy, inform the user that Telegram is currently unavailable.
- No credentials are stored in TaskClaw — all configuration is on the OpenClaw side.
- Rate limits: ~30 messages/second to different chats, ~1 message/second to the same chat.
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 21. WhatsApp Communication Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000021',
  NULL,
  'WhatsApp Communication',
  'Teaches OpenClaw that WhatsApp Business API is available as a communication tool via OpenClaw.',
  $instructions$# WhatsApp Communication Tool

## Overview
WhatsApp Business API communication is configured on the OpenClaw side. When this integration is enabled, it declares that WhatsApp is available as a communication channel for the AI assistant. OpenClaw can send messages via the WhatsApp Business API using its built-in WhatsApp integration.

## How It Works
- This is NOT an API integration with credentials stored in TaskClaw.
- The WhatsApp Business API is configured directly in the OpenClaw instance.
- Enabling this integration tells the AI assistant that WhatsApp is available for sending messages.
- The AI will check the health status before attempting to send messages.

## Capabilities
- Send text messages to WhatsApp numbers
- Send template messages (pre-approved by Meta)
- Send media messages (images, documents, videos)
- Send interactive messages with buttons and lists
- Send location messages

## Template Messages (Critical Rule)
- **First contact**: You MUST use a pre-approved template message to initiate a conversation.
- Templates are created and approved in the Meta Business Suite / WhatsApp Manager.
- Template messages can include dynamic variables (e.g., customer name, order number).
- You cannot send free-form text to a user who has not messaged you first.

## 24-Hour Session Window
- After a user sends you a message, a 24-hour session window opens.
- During this window, you can send free-form text, media, and interactive messages.
- Once the 24-hour window expires, you can ONLY send template messages.
- Each new user message resets the 24-hour window.

## Phone Number Format
- Phone numbers must include the country code WITHOUT the '+' prefix.
- Example: `15551234567` (US), `447911123456` (UK), `5511999887766` (Brazil).

## Health Monitoring
- The system periodically checks if the WhatsApp Business API is reachable.
- **healthy**: WhatsApp API is connected. Messages can be sent.
- **unhealthy**: API is not responding. Check OpenClaw WhatsApp configuration.
- **checking**: A health check is in progress.
- **unknown**: Health has not been checked yet.

## Important Notes
- The tool must be enabled AND healthy before the AI attempts to send messages.
- Always respect the 24-hour session window rule.
- Template messages require pre-approval — they cannot be created on the fly.
- No credentials are stored in TaskClaw — all configuration is on the OpenClaw side.
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 22. Slack Communication Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000022',
  NULL,
  'Slack Communication',
  'Teaches OpenClaw that Slack is available as a communication tool, configured on the OpenClaw side.',
  $instructions$# Slack Communication Tool

## Overview
Slack communication is configured on the OpenClaw side. When this integration is enabled, it declares that Slack is available as a communication channel for the AI assistant. OpenClaw can post messages to Slack channels and send DMs using its built-in Slack integration.

## How It Works
- This is NOT an API integration with credentials stored in TaskClaw.
- The Slack bot/app is configured directly in the OpenClaw instance.
- Enabling this integration tells the AI assistant that Slack is available for posting messages.
- The AI will check the health status before attempting to send messages.

## Capabilities
- Post messages to Slack channels
- Send direct messages (DMs) to users
- Use Block Kit for rich message formatting
- React to messages with emoji reactions
- Reply in threads for organized conversations
- Send messages with attachments

## Block Kit Formatting
Slack uses Block Kit for rich message layouts:
```json
{
  "blocks": [
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Task Completed*\nReview PR #42 has been merged." }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "View Task" }, "url": "https://..." }
      ]
    }
  ]
}
```

## Message Formatting (mrkdwn)
- **Bold**: `*bold text*`
- **Italic**: `_italic text_`
- **Strikethrough**: `~strikethrough~`
- **Code**: `` `inline code` ``
- **Code block**: ` ```code block``` `
- **Link**: `<https://example.com|Link Text>`
- **User mention**: `<@USER_ID>`
- **Channel mention**: `<#CHANNEL_ID>`

## Thread Support
- Messages can be posted as replies in existing threads.
- Use threads to keep conversations organized and avoid cluttering channels.
- The AI should prefer threads for follow-up messages on the same topic.

## Health Monitoring
- The system periodically checks if the Slack bot is connected and responsive.
- **healthy**: Slack bot is connected. Messages can be sent.
- **unhealthy**: Bot is not responding. Check OpenClaw Slack configuration.
- **checking**: A health check is in progress.
- **unknown**: Health has not been checked yet.

## Important Notes
- The tool must be enabled AND healthy before the AI attempts to send messages.
- If health status is unhealthy, inform the user that Slack is currently unavailable.
- No credentials are stored in TaskClaw — all configuration is on the OpenClaw side.
- The bot must be invited to a channel before it can post there.
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;


-- ============================================================================
-- Step 2: Insert 5 new Integration Definitions (linked to Skills)
-- ============================================================================

-- 18. Notion Source
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000018',
  NULL,
  'notion-source',
  'Notion',
  'Sync tasks from your Notion databases',
  '📝',
  '{source}',
  'api_key',
  '{"key_fields": [{"key": "api_key", "label": "Integration Token", "type": "password", "required": true, "placeholder": "ntn_xxxxxxxxxxxxx", "help_text": "Create an integration at notion.so/my-integrations and share your database with it."}]}'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000018',
  $guide$## Setup Guide: Notion Task Sync

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration** and give it a name (e.g., "TaskClaw Sync")
3. Select the workspace containing your task database
4. Copy the **Integration Token** (starts with `ntn_`)
5. **Important:** Share your database with the integration:
   - Open the database in Notion
   - Click the **...** menu > **Connections** > Add your integration
6. Paste the token above
7. TaskClaw will automatically sync tasks from the shared database
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 19. ClickUp Source
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000019',
  NULL,
  'clickup-source',
  'ClickUp',
  'Sync tasks from your ClickUp lists',
  '⚡',
  '{source}',
  'api_key',
  '{"key_fields": [{"key": "api_token", "label": "API Token", "type": "password", "required": true, "placeholder": "pk_xxxxxxxxxxxxx", "help_text": "Find your API token in ClickUp Settings → Apps → API Token."}]}'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000019',
  $guide$## Setup Guide: ClickUp Task Sync

1. Log in to [ClickUp](https://app.clickup.com/)
2. Go to **Settings** (bottom-left) > **Apps**
3. Under **API Token**, click **Generate** (or copy your existing token)
4. The token starts with `pk_`
5. Paste the API token above
6. Select the Space, Folder, and List you want to sync tasks from
7. TaskClaw will automatically import and sync tasks from the selected list
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 20. Telegram Communication
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000020',
  NULL,
  'telegram-comm',
  'Telegram',
  'Send and receive messages via Telegram bots',
  '✈️',
  '{communication}',
  'none',
  '{}'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000020',
  $guide$Telegram is configured on the OpenClaw side. Enable this integration to declare that Telegram is available for AI communication tasks. The AI will check health status before attempting to send messages.$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 21. WhatsApp Communication
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000021',
  NULL,
  'whatsapp-comm',
  'WhatsApp',
  'Send messages via WhatsApp Business API',
  '💬',
  '{communication}',
  'none',
  '{}'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000021',
  $guide$WhatsApp Business API is configured on the OpenClaw side. Enable this integration to declare that WhatsApp is available for AI communication tasks.$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 22. Slack Communication
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000022',
  NULL,
  'slack-comm',
  'Slack',
  'Post messages to Slack channels and DMs',
  '#️⃣',
  '{communication}',
  'none',
  '{}'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000022',
  $guide$Slack is configured on the OpenClaw side. Enable this integration to declare that Slack is available for AI communication tasks.$guide$,
  TRUE
) ON CONFLICT DO NOTHING;
