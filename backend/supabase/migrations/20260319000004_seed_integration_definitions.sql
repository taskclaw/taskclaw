-- Seed 17 pre-built integration definitions + linked Skills
-- These are system-wide definitions (account_id = NULL, is_system = true)
-- Skills use skill_type = 'integration'
--
-- Depends on:
--   20260319000001_add_skill_type.sql (skill_type column)
--   20260319000002_create_integrations.sql (integration_definitions table)

-- ============================================================================
-- Step 0: Allow NULL account_id on skills for system-wide integration skills
-- ============================================================================
ALTER TABLE public.skills ALTER COLUMN account_id DROP NOT NULL;

-- Allow system skills (account_id IS NULL) to be read by any authenticated user
CREATE POLICY "System skills are visible to all authenticated users"
  ON public.skills
  FOR SELECT
  USING (account_id IS NULL);

-- Drop the unique constraint that includes account_id, then re-add it to allow NULLs
-- The original constraint is: UNIQUE(account_id, name)
-- NULLs are distinct in UNIQUE constraints in PostgreSQL, so this works already.
-- No change needed — multiple NULL account_id rows with different names are fine.

-- ============================================================================
-- Step 1: Insert all 17 integration Skills
-- ============================================================================

-- 1. X/Twitter API Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  NULL,
  'X/Twitter API Integration',
  'Teaches OpenClaw how to use the X (Twitter) API v2 for posting tweets, managing media, and reading timelines.',
  $instructions$# X (Twitter) API v2 Integration

## Overview
The X API v2 allows you to create and manage tweets, upload media, read timelines, search tweets, and manage user relationships on behalf of the connected account.

## Base URL
`https://api.x.com/2`

## Authentication
X API v2 uses OAuth 1.0a for user-context requests. You must sign every request using:
- API Key (Consumer Key)
- API Key Secret (Consumer Secret)
- Access Token
- Access Token Secret

Use the OAuth 1.0a signature method. The `Authorization` header must contain a properly signed OAuth string. Libraries like `oauth-1.0a` handle this.

**Header format:**
```
Authorization: OAuth oauth_consumer_key="API_KEY",
  oauth_token="ACCESS_TOKEN",
  oauth_signature_method="HMAC-SHA1",
  oauth_timestamp="...",
  oauth_nonce="...",
  oauth_version="1.0",
  oauth_signature="..."
```

## Key Endpoints

### 1. Create a Tweet
**POST** `/2/tweets`
```json
{
  "text": "Hello from TaskClaw!"
}
```
**Response:**
```json
{
  "data": {
    "id": "1234567890",
    "text": "Hello from TaskClaw!"
  }
}
```
Optional fields: `reply` (for reply tweets), `quote_tweet_id`, `poll`, `media` (attach media IDs).

### 2. Delete a Tweet
**DELETE** `/2/tweets/:id`

### 3. Upload Media (v1.1 endpoint — still required)
**Base URL:** `https://upload.twitter.com/1.1`

**POST** `/media/upload` (multipart/form-data)
- `media_data`: Base64-encoded media
- `media_category`: `tweet_image`, `tweet_gif`, `tweet_video`

For large files, use chunked upload:
1. **INIT**: `POST /media/upload` with `command=INIT`, `total_bytes`, `media_type`
2. **APPEND**: `POST /media/upload` with `command=APPEND`, `media_id`, `segment_index`, `media_data`
3. **FINALIZE**: `POST /media/upload` with `command=FINALIZE`, `media_id`

### 4. Get User Timeline
**GET** `/2/users/:id/tweets`
Query params: `max_results` (5-100), `tweet.fields`, `expansions`, `pagination_token`

### 5. Search Recent Tweets
**GET** `/2/tweets/search/recent`
Query params: `query` (search operators), `max_results`, `tweet.fields`

### 6. Get User by Username
**GET** `/2/users/by/username/:username`
Query params: `user.fields=id,name,username,description,public_metrics`

### 7. Like a Tweet
**POST** `/2/users/:user_id/likes`
```json
{ "tweet_id": "1234567890" }
```

### 8. Retweet
**POST** `/2/users/:user_id/retweets`
```json
{ "tweet_id": "1234567890" }
```

## Rate Limits
- **Create Tweet**: 200 requests per 15 min (user auth), monthly limits depend on tier
- **Free Tier**: 500 posts/month, 100 reads/month
- **Basic Tier**: 10,000 posts/month
- **Timelines**: 900 requests per 15 min
- **Search**: 450 requests per 15 min (Basic), 300 (Free)

When rate limited, the API returns HTTP 429. Check headers:
- `x-rate-limit-limit`: ceiling for the endpoint
- `x-rate-limit-remaining`: remaining requests
- `x-rate-limit-reset`: UTC epoch time when limit resets

## Error Handling
- `400` Bad Request — invalid parameters
- `401` Unauthorized — invalid or expired tokens
- `403` Forbidden — insufficient permissions or suspended account
- `429` Too Many Requests — rate limit exceeded
- `503` Service Unavailable — X servers overloaded

Error response format:
```json
{
  "errors": [{ "message": "...", "type": "...", "title": "..." }]
}
```

## Best Practices
1. Always handle rate limits gracefully — check remaining limits before bulk operations
2. Use `tweet.fields` and `expansions` to minimize requests by fetching all needed data at once
3. For media tweets, upload media first, get the media_id, then include it in the tweet payload
4. Use idempotency: the same tweet text posted twice in quick succession may be rejected as duplicate
5. Thread creation: post the first tweet, then reply to it with `reply.in_reply_to_tweet_id`
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 2. Slack Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000002',
  NULL,
  'Slack API Integration',
  'Teaches OpenClaw how to use the Slack Web API for messaging, channel management, and user lookups.',
  $instructions$# Slack Web API Integration

## Overview
The Slack Web API allows you to send messages, manage channels, look up users, upload files, and interact with Slack workspaces programmatically using bot or user tokens.

## Base URL
`https://slack.com/api`

## Authentication
Slack uses OAuth 2.0 Bearer tokens. All requests must include:
```
Authorization: Bearer xoxb-your-bot-token
Content-Type: application/json; charset=utf-8
```
Bot tokens start with `xoxb-`. User tokens start with `xoxp-`.

## Key Endpoints

### 1. Send a Message
**POST** `/chat.postMessage`
```json
{
  "channel": "C1234567890",
  "text": "Hello from TaskClaw!",
  "blocks": [
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Hello* from TaskClaw!" }
    }
  ]
}
```
**Response:**
```json
{
  "ok": true,
  "channel": "C1234567890",
  "ts": "1503435956.000247",
  "message": { "text": "Hello from TaskClaw!", "ts": "1503435956.000247" }
}
```

### 2. Update a Message
**POST** `/chat.update`
```json
{
  "channel": "C1234567890",
  "ts": "1503435956.000247",
  "text": "Updated message text"
}
```

### 3. List Channels
**GET** `/conversations.list`
Query params: `types=public_channel,private_channel`, `limit=100`, `cursor`

### 4. Get Channel Info
**GET** `/conversations.info?channel=C1234567890`

### 5. List Users
**GET** `/users.list`
Query params: `limit=200`, `cursor`

### 6. Look Up User
**GET** `/users.info?user=U1234567890`

### 7. Upload a File
**POST** `/files.upload`
Multipart form data: `channels`, `file`, `filename`, `title`, `initial_comment`

### 8. Add a Reaction
**POST** `/reactions.add`
```json
{
  "channel": "C1234567890",
  "name": "thumbsup",
  "timestamp": "1503435956.000247"
}
```

### 9. Set Channel Topic
**POST** `/conversations.setTopic`
```json
{
  "channel": "C1234567890",
  "topic": "New topic for the channel"
}
```

### 10. Schedule a Message
**POST** `/chat.scheduleMessage`
```json
{
  "channel": "C1234567890",
  "text": "Scheduled message",
  "post_at": 1734567890
}
```

## Block Kit Formatting
Slack uses Block Kit for rich message layouts. Key block types:
- `section` — text with optional accessory (button, image)
- `divider` — horizontal rule
- `actions` — interactive elements (buttons, selects)
- `header` — large bold text
- `context` — small supplementary text/images
- `image` — standalone image

Use `mrkdwn` for Slack-flavored markdown: `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``, `>quote`, `<url|link text>`.

## Rate Limits
- **Tier 1 (chat.postMessage)**: ~1 request per second per workspace
- **Tier 2 (conversations.list)**: ~20 requests per minute
- **Tier 3 (users.list)**: ~50 requests per minute
- **Tier 4 (admin methods)**: ~100+ requests per minute

When rate limited, Slack returns HTTP 429 with a `Retry-After` header (seconds).

## Error Handling
All responses include `"ok": true/false`. On error:
```json
{
  "ok": false,
  "error": "channel_not_found"
}
```
Common errors: `channel_not_found`, `not_in_channel`, `invalid_auth`, `token_revoked`, `missing_scope`, `ratelimited`.

## Required Scopes (Bot Token)
- `chat:write` — send messages
- `channels:read` — list public channels
- `groups:read` — list private channels
- `users:read` — list and look up users
- `files:write` — upload files
- `reactions:write` — add reactions

## Best Practices
1. Use Block Kit for rich formatting instead of plain text
2. Always include a `text` fallback even when using `blocks` (for notifications)
3. Use `unfurl_links: false` to prevent link previews when not needed
4. Paginate with `cursor` and `limit` for list endpoints
5. Respect rate limits — implement exponential backoff on 429 responses
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 3. HubSpot Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000003',
  NULL,
  'HubSpot CRM API Integration',
  'Teaches OpenClaw how to use the HubSpot CRM API v3 for managing contacts, deals, companies, and search.',
  $instructions$# HubSpot CRM API v3 Integration

## Overview
The HubSpot CRM API v3 lets you manage contacts, companies, deals, tickets, and custom objects. You can create, read, update, delete, search, and manage associations between CRM objects.

## Base URL
`https://api.hubapi.com`

## Authentication
HubSpot uses OAuth 2.0 Bearer tokens:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

## Key Endpoints

### 1. Create a Contact
**POST** `/crm/v3/objects/contacts`
```json
{
  "properties": {
    "email": "user@example.com",
    "firstname": "John",
    "lastname": "Doe",
    "phone": "+1234567890",
    "company": "Acme Inc"
  }
}
```

### 2. Get a Contact
**GET** `/crm/v3/objects/contacts/:contactId`
Query params: `properties=email,firstname,lastname,phone`

### 3. Update a Contact
**PATCH** `/crm/v3/objects/contacts/:contactId`
```json
{
  "properties": {
    "phone": "+0987654321"
  }
}
```

### 4. List Contacts
**GET** `/crm/v3/objects/contacts`
Query params: `limit=100`, `after` (pagination cursor), `properties=email,firstname`

### 5. Search Contacts
**POST** `/crm/v3/objects/contacts/search`
```json
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "email",
      "operator": "CONTAINS_TOKEN",
      "value": "example.com"
    }]
  }],
  "sorts": [{ "propertyName": "createdate", "direction": "DESCENDING" }],
  "properties": ["email", "firstname", "lastname"],
  "limit": 10,
  "after": 0
}
```

### 6. Create a Deal
**POST** `/crm/v3/objects/deals`
```json
{
  "properties": {
    "dealname": "New Deal",
    "dealstage": "appointmentscheduled",
    "pipeline": "default",
    "amount": "5000",
    "closedate": "2026-06-30"
  }
}
```

### 7. Create a Company
**POST** `/crm/v3/objects/companies`
```json
{
  "properties": {
    "name": "Acme Inc",
    "domain": "acme.com",
    "industry": "Technology"
  }
}
```

### 8. Associate Objects
**PUT** `/crm/v3/objects/contacts/:contactId/associations/deals/:dealId/:associationType`
Common association types: `contact_to_deal`, `contact_to_company`, `deal_to_company`.

### 9. Batch Create
**POST** `/crm/v3/objects/contacts/batch/create`
```json
{
  "inputs": [
    { "properties": { "email": "a@example.com", "firstname": "A" } },
    { "properties": { "email": "b@example.com", "firstname": "B" } }
  ]
}
```

### 10. Get Pipeline Stages
**GET** `/crm/v3/pipelines/deals`
Returns all deal pipelines and their stages.

## Search Operators
`EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, `BETWEEN`, `IN`, `NOT_IN`, `HAS_PROPERTY`, `NOT_HAS_PROPERTY`, `CONTAINS_TOKEN`, `NOT_CONTAINS_TOKEN`.

## Rate Limits
- **OAuth apps**: 150 requests per 10 seconds per account
- **Private apps**: 200 requests per 10 seconds per account
- **Search**: 5 requests per second per app
- **Batch**: 10 requests per second

HTTP 429 with `Retry-After` header when exceeded.

## Error Handling
```json
{
  "status": "error",
  "message": "Contact already exists. Existing ID: 123",
  "correlationId": "abc-123",
  "category": "CONFLICT"
}
```
Common status codes: `400` validation error, `401` invalid token, `403` insufficient scopes, `404` not found, `409` conflict, `429` rate limit.

## Required OAuth Scopes
- `crm.objects.contacts.read` / `.write`
- `crm.objects.deals.read` / `.write`
- `crm.objects.companies.read` / `.write`
- `crm.schemas.contacts.read`

## Best Practices
1. Use batch endpoints for bulk operations (up to 100 items per batch)
2. Use the search API instead of listing + filtering client-side
3. Always specify `properties` on GET requests to avoid fetching unnecessary data
4. Use associations to link related objects (contact ↔ deal ↔ company)
5. Handle 409 Conflict for duplicate contacts by email
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 4. Stripe Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000004',
  NULL,
  'Stripe API Integration',
  'Teaches OpenClaw how to use the Stripe API for managing payments, customers, subscriptions, and invoices.',
  $instructions$# Stripe API Integration

## Overview
The Stripe API is a RESTful API for managing online payments. It handles charges, customers, subscriptions, invoices, payment intents, and more. All responses are JSON-encoded.

## Base URL
`https://api.stripe.com/v1`

## Authentication
Stripe uses API key authentication via Bearer token:
```
Authorization: Bearer sk_live_your_secret_key
```
Requests use `application/x-www-form-urlencoded` (form-encoded), NOT JSON.

**Important:** Use `sk_test_*` keys for testing, `sk_live_*` for production.

## Key Endpoints

### 1. Create a Customer
**POST** `/v1/customers`
```
email=user@example.com&name=John+Doe&metadata[source]=taskclaw
```
**Response:**
```json
{
  "id": "cus_ABC123",
  "object": "customer",
  "email": "user@example.com",
  "name": "John Doe"
}
```

### 2. Create a Payment Intent
**POST** `/v1/payment_intents`
```
amount=2000&currency=usd&customer=cus_ABC123&payment_method_types[]=card
```
Amount is in cents (2000 = $20.00).

### 3. List Customers
**GET** `/v1/customers`
Query params: `limit=10`, `starting_after=cus_ABC123`, `email=user@example.com`

### 4. Create a Subscription
**POST** `/v1/subscriptions`
```
customer=cus_ABC123&items[0][price]=price_XYZ789
```

### 5. Cancel a Subscription
**DELETE** `/v1/subscriptions/:sub_id`
Or set `cancel_at_period_end=true` to cancel at end of billing period.

### 6. Create an Invoice
**POST** `/v1/invoices`
```
customer=cus_ABC123&auto_advance=true
```

### 7. Retrieve a Charge
**GET** `/v1/charges/:charge_id`

### 8. Issue a Refund
**POST** `/v1/refunds`
```
charge=ch_ABC123&amount=500
```
Partial refund of $5.00. Omit `amount` for full refund.

### 9. List Products
**GET** `/v1/products`
Query params: `active=true`, `limit=20`

### 10. Create a Checkout Session
**POST** `/v1/checkout/sessions`
```
mode=payment&success_url=https://example.com/success&cancel_url=https://example.com/cancel&line_items[0][price]=price_XYZ789&line_items[0][quantity]=1
```

## API Versioning
Include the `Stripe-Version` header to pin a specific API version:
```
Stripe-Version: 2024-12-18
```
Without this header, your account's default API version is used.

## Idempotency
For POST requests, include `Idempotency-Key` header to prevent duplicate operations:
```
Idempotency-Key: unique-request-id-abc123
```

## Rate Limits
- **Live mode**: 100 read requests/sec, 100 write requests/sec
- **Test mode**: 25 read requests/sec, 25 write requests/sec
- HTTP 429 when exceeded with `Retry-After` header

## Error Handling
```json
{
  "error": {
    "type": "card_error",
    "code": "card_declined",
    "message": "Your card was declined.",
    "param": "source"
  }
}
```
Error types: `api_error`, `card_error`, `invalid_request_error`, `authentication_error`, `rate_limit_error`.

## Pagination
All list endpoints support cursor-based pagination:
- `limit`: 1-100 (default 10)
- `starting_after`: object ID to start after
- `ending_before`: object ID to end before
- Response includes `has_more: true/false`

## Best Practices
1. Always use idempotency keys for payment operations to prevent duplicates
2. Use PaymentIntents instead of Charges for modern payment flows
3. Store Stripe customer IDs in your database for easy reference
4. Use `metadata` on any object to store your own key-value data
5. Use webhooks (`/v1/webhook_endpoints`) for async event handling rather than polling
6. All amounts are in the smallest currency unit (cents for USD)
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 5. OpenAI Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000005',
  NULL,
  'OpenAI API Integration',
  'Teaches OpenClaw how to use the OpenAI API for chat completions, image generation, and embeddings.',
  $instructions$# OpenAI API Integration

## Overview
The OpenAI API provides access to AI models for text generation (chat completions), image generation, embeddings, audio transcription, and more. Use it to add AI capabilities to workflows.

## Base URL
`https://api.openai.com/v1`

## Authentication
```
Authorization: Bearer sk-your-api-key
Content-Type: application/json
```
Optionally include `OpenAI-Organization: org-yourorgid` for organization-scoped billing.

## Key Endpoints

### 1. Chat Completions
**POST** `/v1/chat/completions`
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Write a haiku about coding." }
  ],
  "temperature": 0.7,
  "max_tokens": 200
}
```
**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Lines of logic flow..." },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 25, "completion_tokens": 17, "total_tokens": 42 }
}
```
Models: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o1-mini`.

### 2. Generate Images
**POST** `/v1/images/generations`
```json
{
  "model": "gpt-image-1",
  "prompt": "A serene mountain landscape at sunset",
  "n": 1,
  "size": "1024x1024"
}
```

### 3. Create Embeddings
**POST** `/v1/embeddings`
```json
{
  "model": "text-embedding-3-small",
  "input": "The quick brown fox jumps over the lazy dog"
}
```
**Response:**
```json
{
  "data": [{ "embedding": [0.0023, -0.0094, ...], "index": 0 }],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 10, "total_tokens": 10 }
}
```

### 4. Audio Transcription (Whisper)
**POST** `/v1/audio/transcriptions`
Multipart form data: `file` (audio file), `model=whisper-1`, `language` (optional ISO-639-1).

### 5. Text-to-Speech
**POST** `/v1/audio/speech`
```json
{
  "model": "tts-1",
  "input": "Hello, how are you today?",
  "voice": "alloy"
}
```
Returns audio binary. Voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.

### 6. List Models
**GET** `/v1/models`
Returns all available models for your API key.

### 7. Moderations
**POST** `/v1/moderations`
```json
{
  "input": "Text to check for policy violations"
}
```

## Streaming
Add `"stream": true` to chat completions for Server-Sent Events (SSE) streaming. Each chunk:
```
data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}
```
Stream ends with `data: [DONE]`.

## Rate Limits
Rate limits vary by model and tier:
- **GPT-4o**: 500 RPM (Tier 1), 5,000 RPM (Tier 2), 10,000 RPM (Tier 3)
- **GPT-4o-mini**: 500 RPM (Tier 1), 5,000 RPM (Tier 2)
- Token limits apply per minute (TPM) alongside request limits

HTTP 429 with `Retry-After` header when exceeded.

## Error Handling
```json
{
  "error": {
    "message": "Rate limit reached",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```
Common errors: `invalid_api_key`, `model_not_found`, `context_length_exceeded`, `rate_limit_exceeded`, `server_error`.

## Best Practices
1. Use `gpt-4o-mini` for cost-effective tasks, `gpt-4o` for complex reasoning
2. Set `temperature` 0-0.3 for deterministic outputs, 0.7-1.0 for creative tasks
3. Use `max_tokens` to control response length and costs
4. Implement exponential backoff for rate limit retries
5. Use embeddings for semantic search rather than keyword matching
6. Monitor `usage` in responses to track token consumption
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 6. SendGrid Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000006',
  NULL,
  'SendGrid API Integration',
  'Teaches OpenClaw how to use the SendGrid v3 API for sending transactional and marketing emails.',
  $instructions$# SendGrid v3 API Integration

## Overview
SendGrid (by Twilio) provides a v3 REST API for sending transactional and marketing emails, managing contacts, templates, and tracking email delivery. Used for automated email sending from workflows.

## Base URL
`https://api.sendgrid.com`

## Authentication
```
Authorization: Bearer SG.your-api-key
Content-Type: application/json
```

## Key Endpoints

### 1. Send an Email
**POST** `/v3/mail/send`
```json
{
  "personalizations": [{
    "to": [{ "email": "recipient@example.com", "name": "John Doe" }],
    "subject": "Hello from TaskClaw"
  }],
  "from": { "email": "sender@yourdomain.com", "name": "TaskClaw" },
  "content": [{
    "type": "text/html",
    "value": "<h1>Hello!</h1><p>This is a test email.</p>"
  }]
}
```
**Response:** `202 Accepted` (no body — email is queued).

### 2. Send with Dynamic Template
**POST** `/v3/mail/send`
```json
{
  "personalizations": [{
    "to": [{ "email": "recipient@example.com" }],
    "dynamic_template_data": {
      "first_name": "John",
      "order_id": "12345",
      "total": "$49.99"
    }
  }],
  "from": { "email": "sender@yourdomain.com" },
  "template_id": "d-abc123def456"
}
```

### 3. List Templates
**GET** `/v3/templates?generations=dynamic&page_size=50`

### 4. Add Contacts to Lists
**PUT** `/v3/marketing/contacts`
```json
{
  "list_ids": ["abc-123"],
  "contacts": [{
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  }]
}
```

### 5. Get Email Statistics
**GET** `/v3/stats?start_date=2026-01-01&end_date=2026-01-31`
Returns: requests, delivered, bounces, opens, clicks, spam reports.

### 6. Validate Email (Verification)
**POST** `/v3/validations/email`
```json
{ "email": "user@example.com" }
```

### 7. Get Bounce List
**GET** `/v3/suppression/bounces?start_time=1704067200`

### 8. Delete from Suppression
**DELETE** `/v3/suppression/bounces/:email`

## Personalizations
SendGrid supports up to 1,000 personalizations per request, each with different recipients, subjects, and dynamic data. This enables batch sending with unique content per recipient.

## Rate Limits
- **Mail Send**: Depends on plan — Free: 100 emails/day, Essentials: 50,000-100,000/month
- **API calls**: 600 requests per minute
- HTTP 429 when exceeded

## Error Handling
```json
{
  "errors": [{
    "message": "The from email does not contain a valid address.",
    "field": "from.email",
    "help": "https://sendgrid.api-docs.io/..."
  }]
}
```
Status codes: `400` validation error, `401` unauthorized, `403` forbidden, `413` payload too large (max 30MB), `429` rate limited.

## Best Practices
1. Always authenticate your sending domain (SPF, DKIM, DMARC) before sending
2. Use dynamic templates for consistent, maintainable email design
3. Include both `text/plain` and `text/html` content for best deliverability
4. Use `personalizations` for batch sending — one API call, multiple recipients
5. Monitor bounces and unsubscribes via suppression groups
6. Use categories and custom_args for tracking different email types
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 7. LinkedIn Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000007',
  NULL,
  'LinkedIn Marketing API Integration',
  'Teaches OpenClaw how to use the LinkedIn Marketing API for sharing posts, reading profiles, and managing company pages.',
  $instructions$# LinkedIn Marketing API Integration

## Overview
The LinkedIn Marketing API enables posting content on behalf of members or organizations, reading profile data, managing company pages, and accessing analytics. Uses the Posts API (replaces legacy UGC Posts API).

## Base URL
`https://api.linkedin.com/v2`

## Authentication
OAuth 2.0 Bearer token with required protocol headers:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
X-Restli-Protocol-Version: 2.0.0
LinkedIn-Version: 202501
```
The `LinkedIn-Version` header should use the format `YYYYMM`.

## Key Endpoints

### 1. Create a Text Post (Member)
**POST** `/v2/posts`
```json
{
  "author": "urn:li:person:MEMBER_ID",
  "commentary": "Excited to share our latest update! #innovation",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "lifecycleState": "PUBLISHED"
}
```

### 2. Create a Post with Image
First, register the image upload:
**POST** `/v2/images?action=initializeUpload`
```json
{
  "initializeUploadRequest": {
    "owner": "urn:li:person:MEMBER_ID"
  }
}
```
Then upload the image binary to the returned `uploadUrl`. Finally create the post with the image URN.

### 3. Create an Organization Post
**POST** `/v2/posts`
```json
{
  "author": "urn:li:organization:ORG_ID",
  "commentary": "Company announcement text",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED"
  },
  "lifecycleState": "PUBLISHED"
}
```

### 4. Get Current Member Profile
**GET** `/v2/me`
Returns: `id`, `localizedFirstName`, `localizedLastName`, `profilePicture`.

### 5. Get Organization Info
**GET** `/v2/organizations/:orgId`

### 6. Get Post Analytics
**GET** `/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:ORG_ID`

### 7. Delete a Post
**DELETE** `/v2/posts/:postUrn`

### 8. Search Company Followers
**GET** `/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:ORG_ID`

## Post Content Types
- **Text only**: Just `commentary` field
- **Image post**: Upload image first, then include `content.media.id` in post
- **Article/Link**: Include URL in `content.article` object
- **Video**: Upload video via `/v2/videos?action=initializeUpload`, then reference in post
- **Carousel**: Multiple images in `content.multiImage.images` array

## Rate Limits
- **Application-level**: 100,000 requests per day
- **Member-level**: 100 requests per day for posting
- **Organization posting**: 100 posts per day per organization
- HTTP 429 with `X-Li-Fabric` and `Retry-After` headers

## Required OAuth Scopes
- `w_member_social` — create/modify posts as member
- `r_liteprofile` — read basic profile
- `r_organization_social` — read organization posts
- `w_organization_social` — post as organization
- `rw_organization_admin` — manage organization pages

## Error Handling
```json
{
  "status": 403,
  "serviceErrorCode": 100,
  "message": "Not enough permissions to access: POST /posts"
}
```

## Best Practices
1. Always include `X-Restli-Protocol-Version: 2.0.0` and `LinkedIn-Version` headers
2. Use URN format for all entity references (e.g., `urn:li:person:ABC123`)
3. Character limit for posts is 3,000 characters
4. Upload media (images/videos) before creating the post that references them
5. Use organization posting for brand accounts, member posting for personal accounts
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 8. Instagram Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000008',
  NULL,
  'Instagram Graph API Integration',
  'Teaches OpenClaw how to use the Instagram Graph API for content publishing, stories, and insights on professional accounts.',
  $instructions$# Instagram Graph API Integration

## Overview
The Instagram Graph API (via Meta/Facebook) allows publishing photos, videos, reels, carousels, and stories to Instagram professional accounts. It also provides insights and comment management.

## Base URL
`https://graph.facebook.com/v21.0`

## Authentication
OAuth 2.0 Bearer token (Facebook/Meta Page token with Instagram permissions):
```
Authorization: Bearer YOUR_PAGE_ACCESS_TOKEN
```
The token must have Instagram-related permissions assigned to the connected Facebook Page.

## Content Publishing Flow
Instagram publishing is a two-step process:
1. **Create a media container** — upload/reference the media
2. **Publish the container** — make it live on the account

### 1. Create Image Container
**POST** `/{ig-user-id}/media`
```json
{
  "image_url": "https://example.com/photo.jpg",
  "caption": "Beautiful sunset! #photography",
  "access_token": "YOUR_TOKEN"
}
```
**Response:** `{ "id": "container-id-123" }`

### 2. Publish the Container
**POST** `/{ig-user-id}/media_publish`
```json
{
  "creation_id": "container-id-123",
  "access_token": "YOUR_TOKEN"
}
```

### 3. Create Video/Reel Container
**POST** `/{ig-user-id}/media`
```json
{
  "media_type": "REELS",
  "video_url": "https://example.com/video.mp4",
  "caption": "Check this out!",
  "share_to_feed": true,
  "access_token": "YOUR_TOKEN"
}
```
Then poll the container status until `status_code` is `FINISHED`, then publish.

### 4. Create Carousel Post
**Step 1:** Create individual item containers (images/videos) without `caption`:
**POST** `/{ig-user-id}/media`
```json
{
  "image_url": "https://example.com/photo1.jpg",
  "is_carousel_item": true,
  "access_token": "YOUR_TOKEN"
}
```
**Step 2:** Create carousel container referencing all items:
**POST** `/{ig-user-id}/media`
```json
{
  "media_type": "CAROUSEL",
  "children": ["container-1", "container-2", "container-3"],
  "caption": "Swipe through! #carousel",
  "access_token": "YOUR_TOKEN"
}
```
**Step 3:** Publish the carousel container.

### 5. Create Story
**POST** `/{ig-user-id}/media`
```json
{
  "image_url": "https://example.com/story.jpg",
  "media_type": "STORIES",
  "access_token": "YOUR_TOKEN"
}
```

### 6. Get Account Insights
**GET** `/{ig-user-id}/insights?metric=impressions,reach,profile_views&period=day`

### 7. Get Media Insights
**GET** `/{media-id}/insights?metric=engagement,impressions,reach,saved`

### 8. Check Publishing Rate Limit
**GET** `/{ig-user-id}/content_publishing_limit`

## Rate Limits
- **Publishing**: Max 50 posts per 24 hours per account
- **API calls**: 200 calls per hour per user
- **Carousel**: Max 10 items per carousel
- Media must be JPEG for images

## Required Permissions
- `instagram_basic` — read profile info
- `instagram_content_publish` — publish content
- `instagram_manage_insights` — access analytics
- `instagram_manage_comments` — manage comments
- `pages_show_list` — list connected pages
- `pages_read_engagement` — read page data

## Error Handling
```json
{
  "error": {
    "message": "Invalid parameter",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 2207050,
    "fbtrace_id": "ABC123"
  }
}
```
Common errors: `190` (expired token), `100` (invalid parameter), `4` (rate limit), `368` (temporarily blocked).

## Best Practices
1. Always use the two-step container → publish flow
2. For videos/reels, poll the container status before publishing (processing takes time)
3. Media URLs must be publicly accessible — Instagram fetches them server-side
4. Include alt_text for accessibility: `"alt_text": "Description of image"`
5. Only JPEG images are supported — convert PNG/WebP before uploading
6. Schedule posts by creating the container in advance and publishing at the desired time
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 9. TikTok Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000009',
  NULL,
  'TikTok Content Posting API Integration',
  'Teaches OpenClaw how to use the TikTok Content Posting API for uploading videos and publishing content.',
  $instructions$# TikTok Content Posting API Integration

## Overview
The TikTok Content Posting API allows third-party apps to upload videos, photos, and carousels to TikTok on behalf of users. Supports both direct posting and "inbox" mode (user reviews before posting).

## Base URL
`https://open.tiktokapis.com/v2`

## Authentication
OAuth 2.0 Bearer token:
```
Authorization: Bearer act.your-access-token
Content-Type: application/json; charset=UTF-8
```
Required scope: `video.upload` (for uploading) and `video.publish` (for direct posting).

## Key Endpoints

### 1. Direct Post — Initialize Video Upload
**POST** `/v2/post/publish/content/init/`
```json
{
  "post_info": {
    "title": "Check out this video!",
    "description": "Amazing content #trending",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_duet": false,
    "disable_comment": false,
    "disable_stitch": false,
    "video_cover_timestamp_ms": 1000
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "https://example.com/video.mp4"
  }
}
```
For file upload, use `"source": "FILE_UPLOAD"` and you will receive an `upload_url` in the response.

### 2. Inbox Post — Initialize Upload
**POST** `/v2/post/publish/inbox/video/init/`
Same payload as direct post. Video goes to user's drafts for review before publishing.

### 3. Upload Video File (chunked)
After init with `FILE_UPLOAD`, upload binary to the returned `upload_url`:
```
PUT {upload_url}
Content-Range: bytes 0-{chunk_size-1}/{total_size}
Content-Type: video/mp4
[binary data]
```
- Minimum chunk size: 5 MB
- Maximum chunk size: 64 MB
- Final chunk can be up to 128 MB

### 4. Check Publish Status
**POST** `/v2/post/publish/status/fetch/`
```json
{
  "publish_id": "published-id-from-init"
}
```

### 5. Upload Photo Post
**POST** `/v2/post/publish/content/init/`
```json
{
  "post_info": {
    "title": "Photo carousel!",
    "description": "#photos",
    "privacy_level": "PUBLIC_TO_EVERYONE"
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_urls": [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg"
    ]
  },
  "media_type": "PHOTO"
}
```

### 6. Get Creator Info
**GET** `/v2/post/publish/creator_info/query/`
Returns publishing permissions and limits for the authenticated user.

## Privacy Levels
- `PUBLIC_TO_EVERYONE` — visible to all
- `MUTUAL_FOLLOW_FRIENDS` — mutual followers only
- `FOLLOWER_OF_CREATOR` — followers only
- `SELF_ONLY` — only the creator can see it

## Rate Limits
- **Per user**: 6 requests per minute per access_token
- **Per app**: Varies by developer tier
- Maximum video size: 4 GB
- Maximum video length: 10 minutes (60 minutes for some accounts)

## Error Handling
```json
{
  "error": {
    "code": "invalid_param",
    "message": "The video_url is not accessible.",
    "log_id": "abc123"
  }
}
```
Common error codes: `access_token_invalid`, `scope_not_authorized`, `rate_limit_exceeded`, `invalid_param`, `video_processing_failed`.

## Best Practices
1. Use `PULL_FROM_URL` for simplicity — provide a publicly accessible video URL
2. For large files, use chunked `FILE_UPLOAD` with proper Content-Range headers
3. Always check publish status after initialization — processing is asynchronous
4. Use "inbox" mode for user review workflows — gives the user final control
5. Query creator info first to check if the user has posting permissions
6. Video requirements: MP4 or WebM format, H.264 codec recommended
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 10. Google Ads Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000010',
  NULL,
  'Google Ads API Integration',
  'Teaches OpenClaw how to use the Google Ads API for campaign management, ad groups, keywords, and performance reporting.',
  $instructions$# Google Ads API Integration

## Overview
The Google Ads API allows programmatic management of Google Ads campaigns, ad groups, keywords, ads, bidding strategies, and performance reporting. It supports both REST and gRPC transports.

## Base URL (REST)
`https://googleads.googleapis.com/v18`

## Authentication
OAuth 2.0 Bearer token plus a developer token:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
developer-token: YOUR_DEVELOPER_TOKEN
login-customer-id: MANAGER_CUSTOMER_ID (if using manager account)
```

## Key Endpoints

### 1. List Accessible Customers
**GET** `/v18/customers:listAccessibleCustomers`
Returns customer resource names the authenticated user can access.

### 2. Search (GAQL Query)
**POST** `/v18/customers/{customer_id}/googleAds:searchStream`
```json
{
  "query": "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50"
}
```
This is the primary way to read data. Uses Google Ads Query Language (GAQL).

### 3. Create a Campaign
**POST** `/v18/customers/{customer_id}/campaigns:mutate`
```json
{
  "operations": [{
    "create": {
      "name": "My Search Campaign",
      "advertisingChannelType": "SEARCH",
      "status": "PAUSED",
      "campaignBudget": "customers/{customer_id}/campaignBudgets/{budget_id}",
      "biddingStrategyType": "TARGET_CPA",
      "targetCpa": { "targetCpaMicros": "2000000" }
    }
  }]
}
```
Amounts are in micros (1,000,000 = $1.00).

### 4. Create a Campaign Budget
**POST** `/v18/customers/{customer_id}/campaignBudgets:mutate`
```json
{
  "operations": [{
    "create": {
      "name": "Daily Budget $50",
      "amountMicros": "50000000",
      "deliveryMethod": "STANDARD"
    }
  }]
}
```

### 5. Create an Ad Group
**POST** `/v18/customers/{customer_id}/adGroups:mutate`
```json
{
  "operations": [{
    "create": {
      "name": "Ad Group 1",
      "campaign": "customers/{customer_id}/campaigns/{campaign_id}",
      "status": "ENABLED",
      "cpcBidMicros": "1000000"
    }
  }]
}
```

### 6. Add Keywords
**POST** `/v18/customers/{customer_id}/adGroupCriteria:mutate`
```json
{
  "operations": [{
    "create": {
      "adGroup": "customers/{customer_id}/adGroups/{ad_group_id}",
      "keyword": {
        "text": "buy running shoes",
        "matchType": "PHRASE"
      },
      "status": "ENABLED"
    }
  }]
}
```
Match types: `EXACT`, `PHRASE`, `BROAD`.

### 7. Create a Responsive Search Ad
**POST** `/v18/customers/{customer_id}/adGroupAds:mutate`
```json
{
  "operations": [{
    "create": {
      "adGroup": "customers/{customer_id}/adGroups/{ad_group_id}",
      "ad": {
        "responsiveSearchAd": {
          "headlines": [
            { "text": "Buy Running Shoes" },
            { "text": "Free Shipping Available" },
            { "text": "Best Prices Online" }
          ],
          "descriptions": [
            { "text": "Shop the latest running shoes. Free returns." },
            { "text": "Premium quality at affordable prices." }
          ],
          "finalUrls": ["https://example.com/running-shoes"]
        }
      },
      "status": "ENABLED"
    }
  }]
}
```

### 8. Performance Report (GAQL)
**POST** `/v18/customers/{customer_id}/googleAds:searchStream`
```json
{
  "query": "SELECT ad_group.name, ad_group_ad.ad.id, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM ad_group_ad WHERE segments.date DURING LAST_7_DAYS"
}
```

## Google Ads Query Language (GAQL)
Used for all read operations. Syntax:
```sql
SELECT field1, field2, metric1
FROM resource_name
WHERE condition1 AND condition2
ORDER BY metric1 DESC
LIMIT 100
```
Resources: `campaign`, `ad_group`, `ad_group_ad`, `ad_group_criterion`, `keyword_view`, etc.

## Rate Limits
- **Basic access**: 15,000 requests per day, 1,500 per 100 seconds
- **Standard access**: 150,000 requests per day
- Mutate operations: 5,000 operations per request

## Error Handling
Errors use gRPC-style codes even on REST: `AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `INTERNAL_ERROR`, `QUOTA_ERROR`, `REQUEST_ERROR`.

## Best Practices
1. Use `searchStream` instead of `search` for large result sets (streaming reduces memory)
2. All monetary values are in micros (divide by 1,000,000 for dollar amounts)
3. Create campaigns in PAUSED state first, then enable after review
4. Use GAQL for all reporting — it's more flexible than predefined report types
5. Always include `metrics.cost_micros` in reports to track spend
6. Batch multiple operations in a single mutate request for efficiency
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 11. Loops.so Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000011',
  NULL,
  'Loops.so API Integration',
  'Teaches OpenClaw how to use the Loops.so API for sending transactional emails, managing contacts, and triggering events.',
  $instructions$# Loops.so API Integration

## Overview
Loops is an email platform for SaaS companies. Its REST API allows you to manage contacts, send transactional emails, trigger loop events, and manage mailing lists programmatically.

## Base URL
`https://app.loops.so/api/v1`

## Authentication
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```
Generate your API key in Loops: Settings > API.

## Key Endpoints

### 1. Create or Update a Contact
**POST** `/contacts/create`
```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "source": "taskclaw",
  "subscribed": true,
  "userGroup": "premium",
  "customField1": "value1"
}
```
If the contact already exists (by email), it will be updated.

### 2. Update a Contact
**PUT** `/contacts/update`
```json
{
  "email": "user@example.com",
  "firstName": "Jane"
}
```

### 3. Find a Contact
**GET** `/contacts/find?email=user@example.com`

### 4. Delete a Contact
**POST** `/contacts/delete`
```json
{ "email": "user@example.com" }
```

### 5. Send a Transactional Email
**POST** `/transactional`
```json
{
  "transactionalId": "cm1234abcdef",
  "email": "user@example.com",
  "dataVariables": {
    "name": "John",
    "resetLink": "https://example.com/reset?token=abc123",
    "companyName": "Acme Inc"
  },
  "addToAudience": false
}
```
The `transactionalId` is the ID of the transactional email template created in the Loops dashboard.

### 6. Send an Event
**POST** `/events/send`
```json
{
  "email": "user@example.com",
  "eventName": "signup_completed",
  "eventProperties": {
    "plan": "pro",
    "source": "website"
  }
}
```
Events can trigger Loops (automated sequences) configured in the dashboard.

### 7. List Mailing Lists
**GET** `/lists`

### 8. List Transactional Emails
**GET** `/transactional`
Returns all published transactional email templates with their IDs and names.

### 9. List Contact Properties
**GET** `/contacts/properties`
Returns custom property definitions.

### 10. Create Contact Property
**POST** `/contacts/properties`
```json
{
  "key": "company_size",
  "label": "Company Size",
  "type": "string"
}
```

## Rate Limits
- **10 requests per second** per team
- HTTP 429 when exceeded

## Error Handling
```json
{
  "success": false,
  "message": "An error occurred."
}
```
Common errors: invalid email format, missing required fields, invalid transactionalId, contact not found.

## Best Practices
1. Use events to trigger automated email sequences (Loops) rather than sending individual transactional emails
2. Use `dataVariables` to personalize transactional emails with dynamic content
3. Set `addToAudience: false` on transactional emails if the recipient is not a marketing contact
4. Use the `Idempotency-Key` header to prevent duplicate sends
5. Create contacts before sending events — events to non-existent contacts will fail
6. Use contact properties for segmentation in the Loops dashboard
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 12. Resend Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000012',
  NULL,
  'Resend API Integration',
  'Teaches OpenClaw how to use the Resend API for sending transactional emails, batch emails, and managing domains.',
  $instructions$# Resend API Integration

## Overview
Resend is a developer-first email API for sending transactional emails. It supports HTML, plain text, React Email templates, attachments, scheduling, and batch sending.

## Base URL
`https://api.resend.com`

## Authentication
```
Authorization: Bearer re_your_api_key
Content-Type: application/json
User-Agent: TaskClaw/1.0
```
**Important:** The `User-Agent` header is required. Requests without it return `403 Forbidden`.

## Key Endpoints

### 1. Send an Email
**POST** `/emails`
```json
{
  "from": "TaskClaw <noreply@yourdomain.com>",
  "to": ["user@example.com"],
  "subject": "Welcome to TaskClaw",
  "html": "<h1>Welcome!</h1><p>Thanks for signing up.</p>",
  "text": "Welcome! Thanks for signing up.",
  "reply_to": "support@yourdomain.com",
  "tags": [
    { "name": "category", "value": "welcome" }
  ]
}
```
**Response:**
```json
{ "id": "email-id-abc123" }
```

### 2. Send Batch Emails
**POST** `/emails/batch`
```json
[
  {
    "from": "noreply@yourdomain.com",
    "to": ["user1@example.com"],
    "subject": "Update 1",
    "html": "<p>Content for user 1</p>"
  },
  {
    "from": "noreply@yourdomain.com",
    "to": ["user2@example.com"],
    "subject": "Update 2",
    "html": "<p>Content for user 2</p>"
  }
]
```
**Response:**
```json
{ "data": [{ "id": "email-1" }, { "id": "email-2" }] }
```

### 3. Get Email Status
**GET** `/emails/:email_id`
Returns: `id`, `from`, `to`, `subject`, `created_at`, `last_event` (sent, delivered, bounced, etc.).

### 4. Schedule an Email
**POST** `/emails`
```json
{
  "from": "noreply@yourdomain.com",
  "to": ["user@example.com"],
  "subject": "Scheduled Email",
  "html": "<p>This was scheduled.</p>",
  "scheduled_at": "2026-04-01T09:00:00Z"
}
```

### 5. Cancel Scheduled Email
**POST** `/emails/:email_id/cancel`

### 6. Send with Attachments
**POST** `/emails`
```json
{
  "from": "noreply@yourdomain.com",
  "to": ["user@example.com"],
  "subject": "Invoice",
  "html": "<p>Please find your invoice attached.</p>",
  "attachments": [
    {
      "filename": "invoice.pdf",
      "content": "base64-encoded-content"
    }
  ]
}
```

### 7. List Domains
**GET** `/domains`

### 8. Verify Domain
**GET** `/domains/:domain_id/verify`

### 9. List API Keys
**GET** `/api-keys`

### 10. Create API Key
**POST** `/api-keys`
```json
{
  "name": "Production Key",
  "permission": "full_access"
}
```

## Idempotency
Include `Idempotency-Key` header to prevent duplicate sends:
```
Idempotency-Key: unique-request-id
```

## Rate Limits
- **Default**: 5 requests per second per team
- **Daily limit**: Depends on plan (Free: 100/day, Pro: 50,000+/day)
- HTTP 429 with `retry-after` header when exceeded

## Error Handling
```json
{
  "statusCode": 422,
  "message": "The 'from' field must contain a valid email address.",
  "name": "validation_error"
}
```
Status codes: `400` bad request, `401` unauthorized, `403` forbidden (missing User-Agent), `404` not found, `422` validation error, `429` rate limited.

## Best Practices
1. Always include the `User-Agent` header — it is mandatory
2. Verify your sending domain before sending production emails
3. Include both `html` and `text` versions for best deliverability
4. Use `tags` for categorizing and filtering email analytics
5. Use batch endpoint for sending multiple emails efficiently (single request)
6. Use `scheduled_at` with ISO 8601 timestamps for scheduling
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 13. Discord Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000013',
  NULL,
  'Discord Bot API Integration',
  'Teaches OpenClaw how to use the Discord Bot API for sending messages, managing channels, and using webhooks.',
  $instructions$# Discord Bot API Integration

## Overview
The Discord API allows bots to send messages, manage channels and roles, create embeds, handle webhooks, and interact with Discord servers (guilds). Use bot tokens for authenticated bot actions or webhooks for simple message posting.

## Base URL
`https://discord.com/api/v10`

## Authentication (Bot Token)
```
Authorization: Bot YOUR_BOT_TOKEN
Content-Type: application/json
```
**Important:** The token must be prefixed with `Bot ` (not `Bearer`).

## Key Endpoints

### 1. Send a Message
**POST** `/channels/{channel_id}/messages`
```json
{
  "content": "Hello from TaskClaw!",
  "tts": false
}
```
**Response:**
```json
{
  "id": "message-id",
  "channel_id": "123456789",
  "content": "Hello from TaskClaw!",
  "author": { "id": "bot-id", "username": "TaskClaw Bot" },
  "timestamp": "2026-03-19T10:00:00Z"
}
```

### 2. Send a Rich Embed
**POST** `/channels/{channel_id}/messages`
```json
{
  "embeds": [{
    "title": "Task Update",
    "description": "Your task **Project Setup** has been completed.",
    "color": 3066993,
    "fields": [
      { "name": "Status", "value": "Completed", "inline": true },
      { "name": "Assignee", "value": "John Doe", "inline": true }
    ],
    "footer": { "text": "TaskClaw Notification" },
    "timestamp": "2026-03-19T10:00:00Z"
  }]
}
```
Color is an integer (decimal). Use hex-to-decimal conversion (e.g., `#2ECC71` = `3066993`).

### 3. Edit a Message
**PATCH** `/channels/{channel_id}/messages/{message_id}`
```json
{
  "content": "Updated message content"
}
```

### 4. Delete a Message
**DELETE** `/channels/{channel_id}/messages/{message_id}`

### 5. Get Channel Info
**GET** `/channels/{channel_id}`

### 6. List Guild Channels
**GET** `/guilds/{guild_id}/channels`

### 7. Create a Webhook
**POST** `/channels/{channel_id}/webhooks`
```json
{
  "name": "TaskClaw Notifications"
}
```

### 8. Execute Webhook (no bot token needed)
**POST** `/webhooks/{webhook_id}/{webhook_token}`
```json
{
  "content": "Webhook message!",
  "username": "TaskClaw",
  "embeds": [{ "title": "Alert", "description": "Something happened." }]
}
```
Webhooks are simpler — no bot token needed, just the webhook URL.

### 9. Add Reaction
**PUT** `/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me`
For custom emoji: `emoji_name:emoji_id`. For Unicode: URL-encode the emoji.

### 10. Create Thread
**POST** `/channels/{channel_id}/threads`
```json
{
  "name": "Discussion Thread",
  "type": 11,
  "auto_archive_duration": 1440
}
```
Type 11 = public thread, 12 = private thread.

## Webhooks vs Bot
- **Webhooks**: Simple, no authentication needed, send-only, limited to one channel each
- **Bot**: Full API access, can read messages, manage channels, handle interactions, works across entire guild

## Rate Limits
- **Global**: 50 requests per second
- **Per route**: Varies (e.g., messages: 5 per 5 seconds per channel)
- **Webhooks**: 5 executions per second per webhook

When rate limited, Discord returns 429 with:
```json
{
  "message": "You are being rate limited.",
  "retry_after": 1.5,
  "global": false
}
```

## Error Handling
```json
{
  "code": 50001,
  "message": "Missing Access"
}
```
Common codes: `10003` (unknown channel), `50001` (missing access), `50013` (missing permissions), `50035` (invalid form body).

## Best Practices
1. Use webhooks for simple notification posting — they are easier and require no bot setup
2. Use embeds for rich formatting instead of plain text messages
3. Respect rate limits — implement retry logic with `retry_after` from 429 responses
4. Bot tokens should never be exposed publicly
5. When sending multiple messages, add a small delay between them to avoid rate limits
6. Use `allowed_mentions` to control @mention behavior and prevent unintended pings
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 14. Telegram Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000014',
  NULL,
  'Telegram Bot API Integration',
  'Teaches OpenClaw how to use the Telegram Bot API for sending messages, media, inline keyboards, and managing chats.',
  $instructions$# Telegram Bot API Integration

## Overview
The Telegram Bot API allows bots to send and receive messages, photos, videos, documents, locations, and interactive keyboards. Bots are created via @BotFather on Telegram, which provides the bot token.

## Base URL
`https://api.telegram.org/bot{BOT_TOKEN}`

All requests are made to `https://api.telegram.org/bot<TOKEN>/<METHOD>`.

## Authentication
The bot token IS the authentication — it is part of the URL. No additional headers needed.
```
POST https://api.telegram.org/bot123456:ABC-DEF/sendMessage
Content-Type: application/json
```

## Key Endpoints

### 1. Send a Text Message
**POST** `/sendMessage`
```json
{
  "chat_id": 123456789,
  "text": "Hello from TaskClaw!",
  "parse_mode": "HTML"
}
```
**Response:**
```json
{
  "ok": true,
  "result": {
    "message_id": 42,
    "chat": { "id": 123456789, "type": "private" },
    "text": "Hello from TaskClaw!"
  }
}
```
Parse modes: `HTML` or `MarkdownV2`.

### 2. Send Message with Inline Keyboard
**POST** `/sendMessage`
```json
{
  "chat_id": 123456789,
  "text": "Choose an option:",
  "reply_markup": {
    "inline_keyboard": [
      [
        { "text": "Option A", "callback_data": "choice_a" },
        { "text": "Option B", "callback_data": "choice_b" }
      ],
      [
        { "text": "Visit Website", "url": "https://example.com" }
      ]
    ]
  }
}
```

### 3. Send a Photo
**POST** `/sendPhoto`
```json
{
  "chat_id": 123456789,
  "photo": "https://example.com/image.jpg",
  "caption": "Check out this image!"
}
```
Or use multipart/form-data with `photo` as file upload.

### 4. Send a Document
**POST** `/sendDocument`
```json
{
  "chat_id": 123456789,
  "document": "https://example.com/file.pdf",
  "caption": "Here is your report"
}
```

### 5. Send a Video
**POST** `/sendVideo`
```json
{
  "chat_id": 123456789,
  "video": "https://example.com/video.mp4",
  "caption": "Watch this!"
}
```

### 6. Send Location
**POST** `/sendLocation`
```json
{
  "chat_id": 123456789,
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### 7. Edit a Message
**POST** `/editMessageText`
```json
{
  "chat_id": 123456789,
  "message_id": 42,
  "text": "Updated text"
}
```

### 8. Delete a Message
**POST** `/deleteMessage`
```json
{
  "chat_id": 123456789,
  "message_id": 42
}
```

### 9. Get Chat Info
**POST** `/getChat`
```json
{ "chat_id": 123456789 }
```

### 10. Set Webhook
**POST** `/setWebhook`
```json
{
  "url": "https://yourserver.com/telegram/webhook",
  "allowed_updates": ["message", "callback_query"]
}
```

## HTML Parse Mode Formatting
```html
<b>bold</b>, <i>italic</i>, <u>underline</u>, <s>strikethrough</s>
<a href="https://example.com">link</a>
<code>inline code</code>
<pre>code block</pre>
```

## Rate Limits
- **Messages**: 30 messages per second to different chats
- **Same chat**: 1 message per second (approximately)
- **Group chat**: 20 messages per minute
- HTTP 429 with `retry_after` parameter when exceeded

## Error Handling
```json
{
  "ok": false,
  "error_code": 400,
  "description": "Bad Request: chat not found"
}
```
Common errors: `400` (bad request), `401` (unauthorized — invalid token), `403` (forbidden — bot was blocked), `429` (too many requests).

## Best Practices
1. Use `parse_mode: "HTML"` for formatting — it is more intuitive than MarkdownV2
2. Use inline keyboards for interactive buttons rather than text commands
3. Always check the `ok` field in responses before processing results
4. Bot tokens should never be shared or exposed in client-side code
5. Use webhooks (setWebhook) for production instead of polling (getUpdates)
6. Send media via URL when possible — avoids large file uploads
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 15. WhatsApp Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000015',
  NULL,
  'WhatsApp Business Cloud API Integration',
  'Teaches OpenClaw how to use the WhatsApp Business Cloud API for sending text, template, and media messages.',
  $instructions$# WhatsApp Business Cloud API Integration

## Overview
The WhatsApp Business Cloud API (by Meta) allows businesses to send and receive messages on WhatsApp programmatically. Supports text messages, template messages, media (images, documents, videos), interactive messages, and location sharing.

## Base URL
`https://graph.facebook.com/v21.0`

## Authentication
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```
The access token is a permanent system user token or temporary user token from the Meta Business Suite.

## Key Endpoints

### 1. Send a Text Message
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "15551234567",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Hello from TaskClaw! How can I help you today?"
  }
}
```
**Response:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "15551234567", "wa_id": "15551234567" }],
  "messages": [{ "id": "wamid.abc123" }]
}
```
**Important:** Phone numbers use international format without '+' (e.g., `15551234567`).

### 2. Send a Template Message
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "template",
  "template": {
    "name": "hello_world",
    "language": { "code": "en_US" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "John" },
          { "type": "text", "text": "your order #12345" }
        ]
      }
    ]
  }
}
```
Templates must be pre-approved in the Meta Business Suite before use.

### 3. Send an Image
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "image",
  "image": {
    "link": "https://example.com/image.jpg",
    "caption": "Check this out!"
  }
}
```

### 4. Send a Document
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "document",
  "document": {
    "link": "https://example.com/report.pdf",
    "caption": "Monthly Report",
    "filename": "report.pdf"
  }
}
```

### 5. Send Interactive Buttons
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Would you like to proceed?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "yes", "title": "Yes" } },
        { "type": "reply", "reply": { "id": "no", "title": "No" } }
      ]
    }
  }
}
```

### 6. Send Interactive List
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Choose a service:" },
    "action": {
      "button": "View Options",
      "sections": [{
        "title": "Services",
        "rows": [
          { "id": "svc_1", "title": "Consulting", "description": "1-hour session" },
          { "id": "svc_2", "title": "Development", "description": "Custom project" }
        ]
      }]
    }
  }
}
```

### 7. Send Location
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "to": "15551234567",
  "type": "location",
  "location": {
    "longitude": -74.0060,
    "latitude": 40.7128,
    "name": "TaskClaw HQ",
    "address": "123 Main St, New York"
  }
}
```

### 8. Mark Message as Read
**POST** `/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.abc123"
}
```

## Message Window Rules
- **Template messages**: Can be sent anytime (require pre-approval)
- **Session messages** (text, media, interactive): Can only be sent within 24 hours of the user's last message
- If no user message in 24 hours, you MUST use a template message to re-open the conversation

## Rate Limits
- **Messages**: Up to 500 messages per second per phone number (Cloud API)
- **Template messages**: Subject to per-template, per-phone-number daily limits
- HTTP 429 when exceeded

## Error Handling
```json
{
  "error": {
    "message": "(#131030) Recipient phone number not in allowed list",
    "type": "OAuthException",
    "code": 131030,
    "fbtrace_id": "abc123"
  }
}
```
Common error codes: `131030` (invalid recipient), `131026` (message undeliverable), `131047` (re-engagement message without template), `130429` (rate limited).

## Best Practices
1. Always use template messages for outbound (business-initiated) conversations
2. Phone numbers must include country code without '+' prefix
3. The 24-hour session window is critical — plan your message flows accordingly
4. Use interactive messages (buttons, lists) for better engagement than plain text
5. Mark messages as read to show blue checkmarks and improve user experience
6. Pre-register and get template messages approved before they are needed
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 16. Custom Webhook Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000016',
  NULL,
  'Custom Webhook Integration',
  'Teaches OpenClaw how to send HTTP POST requests to custom webhook endpoints with JSON payloads and authentication.',
  $instructions$# Custom Webhook Integration

## Overview
A custom webhook integration allows you to send HTTP POST requests with JSON payloads to any URL. This is the most flexible integration type — it can connect to any service that accepts HTTP requests: internal APIs, Zapier, Make.com, n8n, IFTTT, or custom backends.

## How It Works
When triggered, send an HTTP POST request to the configured webhook URL with a JSON body. Optionally include authentication headers.

## Making a Webhook Request

### Basic POST Request
```
POST {webhook_url}
Content-Type: application/json
Authorization: {auth_header_value}

{
  "event": "task.completed",
  "timestamp": "2026-03-19T10:00:00Z",
  "data": {
    "task_id": "abc-123",
    "title": "Review PR #42",
    "status": "completed",
    "assignee": "john@example.com"
  }
}
```

### Authentication Methods
The webhook supports several authentication patterns:

**Bearer Token:**
```
Authorization: Bearer your-secret-token
```

**API Key in Header:**
```
X-API-Key: your-api-key
```

**Basic Auth:**
```
Authorization: Basic base64(username:password)
```

**Custom Header:**
```
X-Webhook-Secret: your-webhook-secret
```

### Common Payload Formats

**Slack-compatible Webhook:**
```json
{
  "text": "Task completed: Review PR #42",
  "blocks": [
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Task Completed*\nReview PR #42" }
    }
  ]
}
```

**Generic Event Payload:**
```json
{
  "event_type": "notification",
  "source": "taskclaw",
  "timestamp": "2026-03-19T10:00:00Z",
  "payload": {
    "message": "Your task has been completed",
    "metadata": { "key": "value" }
  }
}
```

**Zapier/Make.com Webhook:**
```json
{
  "trigger": "new_task",
  "task_name": "Review PR #42",
  "priority": "high",
  "due_date": "2026-03-20"
}
```

## Response Handling
- **2xx**: Success — webhook received the payload
- **3xx**: Redirect — follow the redirect URL
- **4xx**: Client error — check the payload and authentication
- **5xx**: Server error — retry with exponential backoff

## Retry Strategy
If the webhook endpoint returns a non-2xx status:
1. Wait 5 seconds, retry
2. Wait 30 seconds, retry
3. Wait 5 minutes, retry
4. Mark as failed after 3 retries

## Timeout
Set a timeout of 30 seconds for webhook requests. If the endpoint does not respond within 30 seconds, treat it as a failure.

## Security
1. Always use HTTPS URLs for webhooks
2. Include a signature header for payload verification if the receiving service supports it
3. Never send sensitive credentials in the JSON body — use headers for authentication
4. Validate the webhook URL before sending (must start with `https://`)

## Best Practices
1. Keep payloads small and focused — include only necessary data
2. Use a consistent event schema across all webhook triggers
3. Include a `timestamp` and `event_type` in every payload for debugging
4. Implement idempotency — include a unique `event_id` so receivers can deduplicate
5. Log all webhook responses for troubleshooting
6. Test webhooks with services like webhook.site or requestbin before production use
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;

-- 17. Notion Skill
INSERT INTO public.skills (id, account_id, name, description, instructions, skill_type, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000017',
  NULL,
  'Notion API Integration',
  'Teaches OpenClaw how to use the Notion API for querying databases, creating pages, and managing blocks.',
  $instructions$# Notion API Integration

## Overview
The Notion API allows programmatic access to Notion workspaces: query databases, create/update pages, manage blocks (content), and search across the workspace. Use it to sync data between TaskClaw and Notion.

## Base URL
`https://api.notion.com/v1`

## Authentication
```
Authorization: Bearer ntn_your_integration_token
Content-Type: application/json
Notion-Version: 2022-06-28
```
**Important:** Always include the `Notion-Version` header. Integration tokens start with `ntn_` (newer) or `secret_` (legacy).

## Key Endpoints

### 1. Query a Database
**POST** `/v1/databases/{database_id}/query`
```json
{
  "filter": {
    "property": "Status",
    "status": {
      "equals": "In Progress"
    }
  },
  "sorts": [{
    "property": "Created",
    "direction": "descending"
  }],
  "page_size": 50
}
```
**Response:**
```json
{
  "results": [
    {
      "id": "page-id-abc",
      "properties": {
        "Name": { "title": [{ "text": { "content": "My Task" } }] },
        "Status": { "status": { "name": "In Progress" } },
        "Assignee": { "people": [{ "name": "John Doe" }] }
      }
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### 2. Create a Page (in a Database)
**POST** `/v1/pages`
```json
{
  "parent": { "database_id": "database-id-xyz" },
  "properties": {
    "Name": {
      "title": [{ "text": { "content": "New Task from TaskClaw" } }]
    },
    "Status": {
      "status": { "name": "Not Started" }
    },
    "Priority": {
      "select": { "name": "High" }
    },
    "Due Date": {
      "date": { "start": "2026-04-01" }
    }
  },
  "children": [
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "text": { "content": "Task created by TaskClaw integration." } }]
      }
    }
  ]
}
```

### 3. Update a Page
**PATCH** `/v1/pages/{page_id}`
```json
{
  "properties": {
    "Status": { "status": { "name": "Done" } }
  }
}
```

### 4. Get a Page
**GET** `/v1/pages/{page_id}`

### 5. Append Block Children
**PATCH** `/v1/blocks/{block_id}/children`
```json
{
  "children": [
    {
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [{ "text": { "content": "Update from TaskClaw" } }]
      }
    },
    {
      "object": "block",
      "type": "bulleted_list_item",
      "bulleted_list_item": {
        "rich_text": [{ "text": { "content": "Task completed successfully" } }]
      }
    },
    {
      "object": "block",
      "type": "to_do",
      "to_do": {
        "rich_text": [{ "text": { "content": "Review results" } }],
        "checked": false
      }
    }
  ]
}
```

### 6. Get Block Children
**GET** `/v1/blocks/{block_id}/children?page_size=100`

### 7. Search
**POST** `/v1/search`
```json
{
  "query": "project plan",
  "filter": { "value": "page", "property": "object" },
  "sort": { "direction": "descending", "timestamp": "last_edited_time" },
  "page_size": 10
}
```

### 8. Get Database Schema
**GET** `/v1/databases/{database_id}`
Returns property definitions (columns) of the database.

### 9. Delete a Block
**DELETE** `/v1/blocks/{block_id}`
(Actually archives the block — sets `archived: true`.)

### 10. Get All Users
**GET** `/v1/users`
Returns workspace members the integration has access to.

## Property Types (for Database Pages)
- `title` — page name (every database has exactly one)
- `rich_text` — text content
- `number` — numeric value
- `select` — single select dropdown
- `multi_select` — multiple select tags
- `date` — date or date range
- `people` — user references
- `checkbox` — boolean
- `url` — URL string
- `email` — email string
- `status` — status (Not Started, In Progress, Done, etc.)
- `relation` — link to another database
- `formula` — computed property (read-only)
- `rollup` — aggregation from relations (read-only)

## Block Types
`paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `code`, `quote`, `callout`, `divider`, `table`, `image`, `bookmark`, `embed`.

## Rate Limits
- **3 requests per second** per integration
- HTTP 429 with `Retry-After` header when exceeded
- Paginate with `start_cursor` and `page_size` (max 100)

## Error Handling
```json
{
  "object": "error",
  "status": 400,
  "code": "validation_error",
  "message": "The property 'Status' does not exist on the database."
}
```
Common codes: `validation_error`, `unauthorized`, `restricted_resource`, `object_not_found`, `rate_limited`, `internal_server_error`.

## Best Practices
1. Always include the `Notion-Version` header — API behavior varies by version
2. Use database queries with filters instead of fetching all pages and filtering client-side
3. Property names are case-sensitive — match exactly what is in the database
4. For large databases, paginate using `start_cursor` from the response
5. Use `children` when creating pages to add initial content in one request
6. The integration must be explicitly shared with databases/pages to access them
$instructions$,
  'integration',
  TRUE
) ON CONFLICT DO NOTHING;


-- ============================================================================
-- Step 2: Insert all 17 Integration Definitions (linked to Skills)
-- ============================================================================

-- 1. X/Twitter API
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000001',
  NULL,
  'x-twitter',
  'X (Twitter)',
  'Post tweets, manage timelines, upload media, and interact with the X platform via API v2.',
  '𝕏',
  ARRAY['social', 'content', 'marketing'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "API Key (Consumer Key)", "type": "password", "required": true },
      { "key": "api_secret", "label": "API Secret (Consumer Secret)", "type": "password", "required": true },
      { "key": "access_token", "label": "Access Token", "type": "password", "required": true },
      { "key": "access_token_secret", "label": "Access Token Secret", "type": "password", "required": true }
    ]
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000001',
  $guide$## Setup Guide: X (Twitter) API

1. Go to the [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a Project and App (Free tier gives 500 posts/month)
3. Under **Keys and Tokens**, generate:
   - **API Key** and **API Secret** (Consumer keys)
   - **Access Token** and **Access Token Secret** (User authentication)
4. Make sure your app has **Read and Write** permissions
5. Paste all four values into the fields above
6. Use the test chat to verify by asking: "Post a test tweet saying Hello from TaskClaw"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 2. Slack
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000002',
  NULL,
  'slack',
  'Slack',
  'Send messages, manage channels, upload files, and interact with Slack workspaces.',
  '💬',
  ARRAY['communication', 'messaging', 'team'],
  'oauth2',
  '{
    "authorization_url": "https://slack.com/oauth/v2/authorize",
    "token_url": "https://slack.com/api/oauth.v2.access",
    "default_scopes": ["chat:write", "channels:read", "groups:read", "users:read", "files:write", "reactions:write"],
    "scope_separator": ",",
    "pkce": false
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000002',
  $guide$## Setup Guide: Slack

1. Go to [Slack API Apps](https://api.slack.com/apps) and create a new app
2. Choose **From scratch** and select your workspace
3. Under **OAuth & Permissions**, add the required Bot Token Scopes:
   - `chat:write`, `channels:read`, `groups:read`, `users:read`, `files:write`
4. Click **Install to Workspace** and authorize
5. Click **Connect with Slack** below to start the OAuth flow
6. Test by asking: "List my Slack channels" or "Send a message to #general"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 3. HubSpot
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000003',
  NULL,
  'hubspot',
  'HubSpot',
  'Manage CRM contacts, deals, companies, and search across your HubSpot account.',
  '🟠',
  ARRAY['crm', 'sales', 'marketing'],
  'oauth2',
  '{
    "authorization_url": "https://app.hubspot.com/oauth/authorize",
    "token_url": "https://api.hubapi.com/oauth/v1/token",
    "default_scopes": ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read", "crm.objects.deals.write", "crm.objects.companies.read", "crm.objects.companies.write"],
    "scope_separator": " ",
    "pkce": false
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000003',
  $guide$## Setup Guide: HubSpot

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new app under your developer account
3. Under **Auth**, configure the required scopes:
   - `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`, `crm.objects.companies.read/write`
4. Set your redirect URL to the callback URL shown below
5. Click **Connect with HubSpot** to start the OAuth flow
6. Test by asking: "List my HubSpot contacts" or "Create a new contact"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 4. Stripe
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000004',
  NULL,
  'stripe',
  'Stripe',
  'Manage payments, customers, subscriptions, invoices, and refunds via the Stripe API.',
  '💳',
  ARRAY['payments', 'finance', 'billing'],
  'api_key',
  '{
    "key_fields": [
      { "key": "secret_key", "label": "Secret Key", "type": "password", "required": true, "placeholder": "sk_live_... or sk_test_..." }
    ]
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000004',
  $guide$## Setup Guide: Stripe

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to **Developers > API Keys**
3. Copy your **Secret key** (starts with `sk_live_` or `sk_test_`)
4. For testing, use the test mode key (`sk_test_`)
5. Paste the key in the field above
6. Test by asking: "List my Stripe customers" or "Get recent payments"

**Warning:** The secret key grants full access to your Stripe account. Never share it.
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 5. OpenAI
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000005',
  NULL,
  'openai',
  'OpenAI',
  'Access GPT models for text generation, image creation, embeddings, and audio transcription.',
  '🤖',
  ARRAY['ai', 'developer', 'content'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "API Key", "type": "password", "required": true, "placeholder": "sk-..." }
    ]
  }'::jsonb,
  '[{"key": "organization_id", "label": "Organization ID (optional)", "type": "text", "required": false, "placeholder": "org-..."}]'::jsonb,
  'a1000000-0000-0000-0000-000000000005',
  $guide$## Setup Guide: OpenAI

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the key (starts with `sk-`) — it will only be shown once
4. Optionally, find your Organization ID in **Settings > Organization**
5. Paste the API key above
6. Test by asking: "Use OpenAI to generate a haiku about productivity"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 6. SendGrid
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000006',
  NULL,
  'sendgrid',
  'SendGrid',
  'Send transactional and marketing emails using SendGrid templates and dynamic content.',
  '📧',
  ARRAY['email', 'marketing', 'communication'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "API Key", "type": "password", "required": true, "placeholder": "SG...." }
    ]
  }'::jsonb,
  '[{"key": "from_email", "label": "Default From Email", "type": "email", "required": true, "placeholder": "noreply@yourdomain.com"}, {"key": "from_name", "label": "Default From Name", "type": "text", "required": false, "placeholder": "Your Company"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000006',
  $guide$## Setup Guide: SendGrid

1. Log in to [SendGrid](https://app.sendgrid.com/)
2. Go to **Settings > API Keys**
3. Click **Create API Key** with "Full Access" or "Restricted Access" (Mail Send permission required)
4. Copy the API key (starts with `SG.`)
5. Verify your sending domain under **Settings > Sender Authentication**
6. Paste the API key and your default from email above
7. Test by asking: "Send a test email to my-email@example.com"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 7. LinkedIn
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000007',
  NULL,
  'linkedin',
  'LinkedIn',
  'Share posts, read profiles, and manage company pages on LinkedIn via the Marketing API.',
  '🔗',
  ARRAY['social', 'marketing', 'professional'],
  'oauth2',
  '{
    "authorization_url": "https://www.linkedin.com/oauth/v2/authorization",
    "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
    "default_scopes": ["openid", "profile", "w_member_social", "r_organization_social", "w_organization_social"],
    "scope_separator": " ",
    "pkce": false
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000007',
  $guide$## Setup Guide: LinkedIn

1. Go to the [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
2. Create a new app and associate it with a Company Page
3. Under **Products**, request access to the **Community Management API**
4. Under **Auth**, add the redirect URL shown below
5. Configure OAuth 2.0 scopes: `openid`, `profile`, `w_member_social`
6. Click **Connect with LinkedIn** to authorize
7. Test by asking: "Create a LinkedIn post saying: Excited about our new integration!"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 8. Instagram
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000008',
  NULL,
  'instagram',
  'Instagram',
  'Publish photos, videos, reels, carousels, and stories to Instagram professional accounts.',
  '📸',
  ARRAY['social', 'content', 'marketing'],
  'oauth2',
  '{
    "authorization_url": "https://www.facebook.com/v21.0/dialog/oauth",
    "token_url": "https://graph.facebook.com/v21.0/oauth/access_token",
    "default_scopes": ["instagram_basic", "instagram_content_publish", "instagram_manage_insights", "instagram_manage_comments", "pages_show_list", "pages_read_engagement"],
    "scope_separator": ",",
    "pkce": false
  }'::jsonb,
  '[{"key": "instagram_user_id", "label": "Instagram Business Account ID", "type": "text", "required": true, "placeholder": "17841400000000000"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000008',
  $guide$## Setup Guide: Instagram

1. You need a **Facebook Page** connected to an **Instagram Professional Account**
2. Go to [Meta for Developers](https://developers.facebook.com/) and create an app
3. Add the **Instagram Graph API** product to your app
4. Configure OAuth permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`
5. Click **Connect with Instagram** to authorize via Facebook
6. Enter your Instagram Business Account ID (found in the API response after auth)
7. Test by asking: "Publish an image from URL to my Instagram"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 9. TikTok
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000009',
  NULL,
  'tiktok',
  'TikTok',
  'Upload and publish videos, photos, and carousels to TikTok via the Content Posting API.',
  '🎵',
  ARRAY['social', 'content', 'video'],
  'oauth2',
  '{
    "authorization_url": "https://www.tiktok.com/v2/auth/authorize",
    "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
    "default_scopes": ["video.upload", "video.publish"],
    "scope_separator": ",",
    "pkce": true
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000009',
  $guide$## Setup Guide: TikTok

1. Register at the [TikTok Developer Portal](https://developers.tiktok.com/)
2. Create an app and apply for the **Content Posting API**
3. Configure the redirect URI to the callback URL shown below
4. Request the `video.upload` and `video.publish` scopes
5. Wait for app approval (may take a few days)
6. Click **Connect with TikTok** to authorize
7. Test by asking: "Check my TikTok posting permissions"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 10. Google Ads
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000010',
  NULL,
  'google-ads',
  'Google Ads',
  'Manage campaigns, ad groups, keywords, and access performance reports via the Google Ads API.',
  '📊',
  ARRAY['ads', 'marketing', 'analytics'],
  'oauth2',
  '{
    "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_url": "https://oauth2.googleapis.com/token",
    "default_scopes": ["https://www.googleapis.com/auth/adwords"],
    "scope_separator": " ",
    "pkce": true
  }'::jsonb,
  '[{"key": "developer_token", "label": "Developer Token", "type": "password", "required": true, "placeholder": "Your Google Ads developer token"}, {"key": "customer_id", "label": "Customer ID (MCC or Account)", "type": "text", "required": true, "placeholder": "123-456-7890"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000010',
  $guide$## Setup Guide: Google Ads

1. Apply for a [Google Ads API Developer Token](https://developers.google.com/google-ads/api/docs/get-started/dev-token)
2. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
3. Enable the **Google Ads API** for your project
4. Create OAuth 2.0 credentials (Web application type)
5. Set the redirect URI to the callback URL shown below
6. Enter your Developer Token and Customer ID (format: 123-456-7890)
7. Click **Connect with Google Ads** to authorize
8. Test by asking: "Show my Google Ads campaign performance for the last 7 days"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 11. Loops.so
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000011',
  NULL,
  'loops',
  'Loops.so',
  'Send transactional emails, manage contacts, and trigger automated email loops for SaaS.',
  '🔄',
  ARRAY['email', 'marketing', 'saas'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "API Key", "type": "password", "required": true }
    ]
  }'::jsonb,
  '[]'::jsonb,
  'a1000000-0000-0000-0000-000000000011',
  $guide$## Setup Guide: Loops.so

1. Log in to [Loops](https://app.loops.so/)
2. Go to **Settings > API**
3. Click **Generate key** to create an API key
4. Copy the API key and paste it above
5. Test by asking: "List my Loops transactional email templates" or "Find a contact by email"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 12. Resend
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000012',
  NULL,
  'resend',
  'Resend',
  'Send transactional emails, schedule messages, and manage domains with a developer-first email API.',
  '✉️',
  ARRAY['email', 'developer', 'communication'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "API Key", "type": "password", "required": true, "placeholder": "re_..." }
    ]
  }'::jsonb,
  '[{"key": "from_email", "label": "Default From Email", "type": "email", "required": true, "placeholder": "noreply@yourdomain.com"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000012',
  $guide$## Setup Guide: Resend

1. Sign up at [Resend](https://resend.com/)
2. Go to **API Keys** and create a new key
3. Copy the API key (starts with `re_`)
4. Verify your sending domain under **Domains**
5. Paste the key and default from email above
6. Test by asking: "Send a test email to my-email@example.com with subject Hello"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 13. Discord
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000013',
  NULL,
  'discord',
  'Discord',
  'Send messages, manage channels, create embeds, and use webhooks in Discord servers.',
  '🎮',
  ARRAY['communication', 'messaging', 'community'],
  'api_key',
  '{
    "key_fields": [
      { "key": "bot_token", "label": "Bot Token", "type": "password", "required": true }
    ]
  }'::jsonb,
  '[{"key": "default_channel_id", "label": "Default Channel ID", "type": "text", "required": false, "placeholder": "Channel ID for default messages"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000013',
  $guide$## Setup Guide: Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and go to the **Bot** section
3. Click **Reset Token** to generate a bot token — copy it immediately
4. Under **Privileged Gateway Intents**, enable the intents you need
5. Invite the bot to your server using the OAuth2 URL Generator (select `bot` scope and message permissions)
6. Paste the bot token above, and optionally set a default channel ID
7. Test by asking: "Send a message to my Discord channel saying Hello!"

**Note:** To find a Channel ID, enable Developer Mode in Discord settings, then right-click the channel.
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 14. Telegram
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000014',
  NULL,
  'telegram',
  'Telegram',
  'Send messages, photos, documents, and interactive keyboards via Telegram Bot API.',
  '✈️',
  ARRAY['communication', 'messaging', 'bots'],
  'api_key',
  '{
    "key_fields": [
      { "key": "bot_token", "label": "Bot Token", "type": "password", "required": true, "placeholder": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" }
    ]
  }'::jsonb,
  '[{"key": "default_chat_id", "label": "Default Chat ID", "type": "text", "required": false, "placeholder": "Chat or Group ID for default messages"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000014',
  $guide$## Setup Guide: Telegram

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to create your bot
3. BotFather will give you a **Bot Token** (format: `123456:ABC-DEF...`)
4. Copy the token and paste it above
5. To get a Chat ID: send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
6. Optionally set a default Chat ID for quick messaging
7. Test by asking: "Send a Telegram message to my chat saying Hello!"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 15. WhatsApp
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000015',
  NULL,
  'whatsapp',
  'WhatsApp Business',
  'Send text, template, media, and interactive messages via the WhatsApp Business Cloud API.',
  '📱',
  ARRAY['communication', 'messaging', 'business'],
  'api_key',
  '{
    "key_fields": [
      { "key": "access_token", "label": "Permanent Access Token", "type": "password", "required": true },
      { "key": "phone_number_id", "label": "Phone Number ID", "type": "text", "required": true, "placeholder": "Your WhatsApp Phone Number ID" }
    ]
  }'::jsonb,
  '[{"key": "waba_id", "label": "WhatsApp Business Account ID", "type": "text", "required": false, "placeholder": "Your WABA ID"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000015',
  $guide$## Setup Guide: WhatsApp Business

1. Go to [Meta Business Suite](https://business.facebook.com/) and set up a WhatsApp Business Account
2. In the [Meta Developer Portal](https://developers.facebook.com/), create an app with **WhatsApp** product
3. Under **WhatsApp > API Setup**:
   - Find your **Phone Number ID**
   - Generate a **Permanent System User Token** (under Business Settings > System Users)
4. Add a phone number to your WhatsApp Business Account if you have not already
5. Create and get approval for **Message Templates** in WhatsApp Manager
6. Paste the access token and phone number ID above
7. Test by asking: "Send a WhatsApp message to +1234567890 saying Hello"

**Note:** You can only send template messages to users who have not messaged you in the last 24 hours.
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 16. Custom Webhook
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000016',
  NULL,
  'custom-webhook',
  'Custom Webhook',
  'Send HTTP POST requests with JSON payloads to any webhook URL. Connect to Zapier, Make, n8n, or custom APIs.',
  '🔗',
  ARRAY['developer', 'automation', 'custom'],
  'webhook',
  '{
    "key_fields": [
      { "key": "webhook_url", "label": "Webhook URL", "type": "url", "required": true, "placeholder": "https://hooks.example.com/webhook/..." },
      { "key": "auth_header", "label": "Authorization Header (optional)", "type": "password", "required": false, "placeholder": "Bearer your-token or Basic base64..." }
    ]
  }'::jsonb,
  '[{"key": "custom_headers", "label": "Custom Headers (JSON)", "type": "text", "required": false, "placeholder": "{\"X-Custom-Header\": \"value\"}"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000016',
  $guide$## Setup Guide: Custom Webhook

1. Get the webhook URL from your target service:
   - **Zapier**: Create a Zap with "Webhooks by Zapier" trigger
   - **Make.com**: Create a scenario with "Custom webhook" module
   - **n8n**: Add a Webhook node and copy the production URL
   - **Custom API**: Use any HTTPS endpoint that accepts POST requests
2. Paste the webhook URL above
3. If the endpoint requires authentication, enter the Authorization header value (e.g., `Bearer your-token`)
4. For custom headers, enter a JSON object (e.g., `{"X-API-Key": "value"}`)
5. Test by asking: "Send a test webhook with a sample JSON payload"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;

-- 17. Notion
INSERT INTO public.integration_definitions (
  id, account_id, slug, name, description, icon, categories,
  auth_type, auth_config, config_fields, skill_id, setup_guide, is_system
) VALUES (
  'b1000000-0000-0000-0000-000000000017',
  NULL,
  'notion',
  'Notion',
  'Query databases, create and update pages, manage blocks, and search across your Notion workspace.',
  '📝',
  ARRAY['productivity', 'developer', 'documentation'],
  'api_key',
  '{
    "key_fields": [
      { "key": "api_key", "label": "Integration Token", "type": "password", "required": true, "placeholder": "ntn_... or secret_..." }
    ]
  }'::jsonb,
  '[{"key": "default_database_id", "label": "Default Database ID (optional)", "type": "text", "required": false, "placeholder": "The database to query by default"}]'::jsonb,
  'a1000000-0000-0000-0000-000000000017',
  $guide$## Setup Guide: Notion

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **New integration** and give it a name (e.g., "TaskClaw")
3. Select the workspace you want to connect
4. Copy the **Integration Token** (starts with `ntn_` or `secret_`)
5. **Important:** Share your databases/pages with the integration:
   - Open the database or page in Notion
   - Click the **...** menu > **Connections** > Add your integration
6. Optionally, set a default database ID (found in the URL: `notion.so/{workspace}/{database_id}?v=...`)
7. Paste the token above
8. Test by asking: "Query my Notion database" or "Create a new page in Notion"
$guide$,
  TRUE
) ON CONFLICT DO NOTHING;
