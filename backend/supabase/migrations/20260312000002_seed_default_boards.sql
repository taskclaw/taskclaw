-- Seed two default board templates: X Content Pipeline + Personal Board
-- These are system templates (account_id = NULL) available to all users.
-- On account creation, the onboarding flow can install these automatically.

-- ============================================================================
-- Board Template 1: X Content Pipeline
-- ============================================================================
INSERT INTO public.board_templates (
  id,
  account_id,
  name,
  slug,
  description,
  icon,
  color,
  tags,
  manifest,
  manifest_version,
  version,
  is_published,
  is_system,
  published_at,
  author_name,
  author_email
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  NULL,
  'X Content Pipeline',
  'x-content-pipeline',
  'End-to-end content creation pipeline for X (Twitter). From raw idea to published post — with AI-powered drafting, image suggestions, and scheduling.',
  'twitter',
  '#1d9bf0',
  ARRAY['content', 'social-media', 'x', 'twitter', 'marketing'],
  '{
    "manifest_version": "1.0",
    "id": "x-content-pipeline",
    "name": "X Content Pipeline",
    "description": "End-to-end content creation pipeline for X (Twitter). From raw idea to published post — with AI-powered drafting, image suggestions, and scheduling.",
    "version": "1.0.0",
    "author": "system@taskclaw.co",
    "icon": "twitter",
    "color": "#1d9bf0",
    "tags": ["content", "social-media", "x", "twitter", "marketing"],
    "settings": {
      "allow_manual_column_move": true,
      "card_retention_days": 90
    },
    "categories": [
      {
        "slug": "x-idea-generator",
        "name": "X Idea Generator",
        "color": "#8b5cf6",
        "icon": "lightbulb",
        "skills": [
          {
            "slug": "x-trend-research",
            "name": "X Trend Research",
            "description": "Researches trending topics and hashtags on X to generate post ideas aligned with current conversations.",
            "instructions": "You are a social media trend analyst specialized in X (Twitter).\n\nYour job is to help the user generate post ideas based on trending topics, hashtags, and audience interests.\n\n## What you do:\n1. When given a niche or topic area, suggest 3-5 post ideas that tap into current trends\n2. For each idea, provide:\n   - A one-line concept summary\n   - Suggested hashtags (2-4 relevant ones)\n   - The angle or hook that makes it timely\n   - Estimated engagement potential (high/medium/low)\n3. Consider the user''s brand voice if provided\n4. Mix content types: threads, single tweets, quote-tweet prompts, polls\n\n## Guidelines:\n- Prioritize authenticity over virality\n- Avoid controversial or polarizing angles unless the user''s brand is built on hot takes\n- Include at least one \"evergreen\" idea that works regardless of trends\n- Suggest posting times based on general X best practices (morning 8-10am, lunch 12-1pm, evening 6-8pm EST)",
            "is_active": true
          },
          {
            "slug": "x-content-angle-finder",
            "name": "Content Angle Finder",
            "description": "Takes a raw topic and finds unique angles, hooks, and perspectives to make it stand out on X.",
            "instructions": "You are a content strategist who specializes in finding unique angles for X posts.\n\n## Your process:\n1. Take the user''s raw topic or idea\n2. Generate 3-5 distinct angles:\n   - **Contrarian take**: Challenge conventional wisdom\n   - **Personal story**: Frame it as a personal experience or lesson\n   - **Data-driven**: Use statistics or research to support the point\n   - **How-to**: Actionable advice format\n   - **Question/Poll**: Engage the audience directly\n3. For each angle, write a draft hook (first line of the post)\n4. Recommend which angle best fits the user''s goals (growth, engagement, authority)\n\n## Output format:\nFor each angle:\n- **Angle**: [name]\n- **Hook**: [first 1-2 lines]\n- **Why it works**: [brief explanation]\n- **Best for**: [growth/engagement/authority/community]",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "x-copywriter",
        "name": "X Copywriter",
        "color": "#3b82f6",
        "icon": "pen-tool",
        "skills": [
          {
            "slug": "x-post-writer",
            "name": "X Post Writer",
            "description": "Writes compelling X posts and threads with optimized hooks, formatting, and CTAs.",
            "instructions": "You are an expert X (Twitter) copywriter. You write posts that stop the scroll.\n\n## Rules:\n1. **Character limit**: Single posts max 280 characters. Threads can be longer but each tweet in a thread should stand alone.\n2. **Hook first**: The first line MUST be attention-grabbing.\n3. **Formatting**: Use line breaks for readability. One idea per line.\n4. **Thread structure**: Tweet 1: Hook + promise. Tweets 2-N: Deliver value. Last tweet: Summary + CTA.\n5. **Hashtags**: Max 2-3, placed at the end or woven naturally.\n6. **Emojis**: Use sparingly (0-2 per post).\n\n## What NOT to do:\n- Don''t be generic\n- Don''t use corporate speak\n- Don''t start with \"I think\" or \"In my opinion\"\n- Don''t use more than 3 hashtags\n- Don''t write walls of text without line breaks",
            "is_active": true
          },
          {
            "slug": "x-thread-writer",
            "name": "X Thread Writer",
            "description": "Structures long-form content into engaging X threads with proper pacing and hooks.",
            "instructions": "You are a thread architect for X (Twitter). You take a topic and structure it into a viral-worthy thread.\n\n## Thread structure:\n1. Tweet 1 (Hook): Must create curiosity or make a bold promise.\n2. Tweet 2 (Context): Brief background. Why this matters now.\n3. Tweets 3-8 (Body): Core content. One clear point per tweet.\n4. Tweet 9 (Summary): Recap the key takeaways in bullet form.\n5. Tweet 10 (CTA): Ask for engagement + link back to tweet 1.\n\n## Formatting rules:\n- Each tweet: 240 chars max (leave room for thread numbering)\n- Number each tweet: 1/, 2/, 3/ etc.\n- Use line breaks within tweets for readability\n- Include 1-2 standalone tweets that work even without context\n\n## Output:\nDeliver the thread as numbered tweets separated by ---",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "x-visual-advisor",
        "name": "X Visual Advisor",
        "color": "#ec4899",
        "icon": "image",
        "skills": [
          {
            "slug": "x-image-suggestions",
            "name": "Image & Media Suggestions",
            "description": "Suggests images, graphics, screenshots, or video ideas to pair with X posts for maximum engagement.",
            "instructions": "You are a visual content advisor for X (Twitter) posts.\n\nGiven a post draft, suggest the best visual content to pair with it.\n\n## Visual types: Screenshot, Infographic, Meme, Quote Card, Carousel, Video, GIF\n\n## Output:\n- Recommended visual type\n- Description of what the visual should contain\n- Why it enhances the post\n- Alt text suggestion for accessibility\n- Dimensions: 1200x675 (link preview), 1080x1080 (square), or 1080x1350 (portrait)",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "x-editor",
        "name": "X Editor & Optimizer",
        "color": "#f59e0b",
        "icon": "check-circle",
        "skills": [
          {
            "slug": "x-post-reviewer",
            "name": "X Post Reviewer",
            "description": "Reviews and optimizes X posts for engagement, clarity, and platform best practices.",
            "instructions": "You are a senior X (Twitter) editor. Review posts before they go live.\n\n## Checklist: Hook strength, Clarity, Engagement potential, Character count, CTA presence, Formatting, Hashtags, Timing.\n\n## Output:\n- Score: X/10 overall\n- Strengths and improvements\n- Optimized version ready to copy\n- Best day/time to post",
            "is_active": true
          },
          {
            "slug": "x-engagement-optimizer",
            "name": "Engagement Optimizer",
            "description": "Optimizes posts for maximum reach using X algorithm best practices.",
            "instructions": "You are an X (Twitter) algorithm expert. Optimize posts for maximum distribution.\n\n## Factors: Dwell time, Replies, Bookmarks, Reposts, Profile clicks.\n\n## Techniques:\n- Add reply-bait question\n- Include bookmark-worthy takeaway\n- Make hook more specific\n- Suggest self-reply strategy\n- Recommend engagement timing\n\n## Output:\n- Original and optimized version\n- Changes made\n- Engagement strategy for first hour\n- Self-reply suggestion",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "x-scheduler",
        "name": "X Scheduler",
        "color": "#22c55e",
        "icon": "calendar",
        "skills": [
          {
            "slug": "x-scheduling-advisor",
            "name": "Scheduling Advisor",
            "description": "Recommends optimal posting times and content calendar strategies for X.",
            "instructions": "You are an X scheduling strategist.\n\n## Best times (EST): Mon-Fri 8-10AM, 12-1PM, 5-7PM. Peak: Tue-Thu 9AM.\n\n## Calendar: Mon=Motivational, Tue=Educational, Wed=BTS, Thu=Thread, Fri=Casual, Weekend=Repurpose.\n\n## Output: Best posting time, Content type classification, Reuse strategy, Follow-up content suggestion.",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      }
    ],
    "steps": [
      {
        "id": "idea",
        "name": "Idea",
        "type": "input",
        "position": 0,
        "color": "#8b5cf6",
        "linked_category_slug": "x-idea-generator",
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [
            { "key": "topic", "label": "Topic / Niche", "type": "text", "required": true },
            { "key": "content_type", "label": "Content Type", "type": "dropdown", "options": ["Single Post", "Thread", "Poll", "Quote Tweet"] },
            { "key": "goal", "label": "Goal", "type": "dropdown", "options": ["Growth", "Engagement", "Authority", "Community", "Sales"] }
          ],
          "outputs": []
        },
        "on_complete": "drafting",
        "on_error": null
      },
      {
        "id": "drafting",
        "name": "Drafting",
        "type": "ai_process",
        "position": 1,
        "color": "#3b82f6",
        "linked_category_slug": "x-copywriter",
        "ai_config": {
          "enabled": true,
          "ai_first": true,
          "system_prompt": "Write a compelling X post based on the card''s topic and idea. Follow the post writing guidelines from your skills. Output the draft text ready for review."
        },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "draft_text", "label": "Draft Text", "type": "text", "required": true },
            { "key": "hashtags", "label": "Hashtags", "type": "text" },
            { "key": "character_count", "label": "Character Count", "type": "number" }
          ]
        },
        "on_complete": "visual",
        "on_error": "idea"
      },
      {
        "id": "visual",
        "name": "Visual",
        "type": "ai_process",
        "position": 2,
        "color": "#ec4899",
        "linked_category_slug": "x-visual-advisor",
        "ai_config": {
          "enabled": true,
          "ai_first": true,
          "system_prompt": "Based on the draft post, suggest the best visual content to pair with it."
        },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "visual_type", "label": "Visual Type", "type": "dropdown", "options": ["Screenshot", "Infographic", "Meme", "Quote Card", "Carousel", "Video", "GIF", "None"] },
            { "key": "visual_description", "label": "Visual Description", "type": "text" },
            { "key": "alt_text", "label": "Alt Text", "type": "text" }
          ]
        },
        "on_complete": "review",
        "on_error": "drafting"
      },
      {
        "id": "review",
        "name": "Review",
        "type": "human_review",
        "position": 3,
        "color": "#f59e0b",
        "linked_category_slug": "x-editor",
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "final_text", "label": "Final Text", "type": "text", "required": true },
            { "key": "approved", "label": "Approved", "type": "boolean" }
          ]
        },
        "on_complete": "scheduled",
        "on_error": "drafting"
      },
      {
        "id": "scheduled",
        "name": "Scheduled",
        "type": "action",
        "position": 4,
        "color": "#06b6d4",
        "linked_category_slug": "x-scheduler",
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [
            { "key": "scheduled_time", "label": "Scheduled Time", "type": "date", "required": true }
          ],
          "outputs": []
        },
        "on_complete": "published",
        "on_error": "review"
      },
      {
        "id": "published",
        "name": "Published",
        "type": "done",
        "position": 5,
        "color": "#22c55e",
        "linked_category_slug": null,
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "post_url", "label": "Post URL", "type": "url" },
            { "key": "impressions", "label": "Impressions", "type": "number" },
            { "key": "engagement_rate", "label": "Engagement Rate", "type": "text" }
          ]
        }
      }
    ]
  }'::jsonb,
  '1.0',
  '1.0.0',
  TRUE,
  TRUE,
  NOW(),
  'TaskClaw',
  'system@taskclaw.co'
)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- Board Template 2: Personal Board
-- ============================================================================
INSERT INTO public.board_templates (
  id,
  account_id,
  name,
  slug,
  description,
  icon,
  color,
  tags,
  manifest,
  manifest_version,
  version,
  is_published,
  is_system,
  published_at,
  author_name,
  author_email
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  NULL,
  'Personal Board',
  'personal-board',
  'Your personal life management board. Track everyday tasks — doctor appointments, errands, school pickups, home repairs, shopping, and more. Powered by a Secretary AI agent.',
  'user',
  '#8b5cf6',
  ARRAY['personal', 'life', 'assistant', 'secretary', 'errands'],
  '{
    "manifest_version": "1.0",
    "id": "personal-board",
    "name": "Personal Board",
    "description": "Your personal life management board. Track everyday tasks — doctor appointments, errands, school pickups, home repairs, shopping, and more. Powered by a Secretary AI agent.",
    "version": "1.0.0",
    "author": "system@taskclaw.co",
    "icon": "user",
    "color": "#8b5cf6",
    "tags": ["personal", "life", "assistant", "secretary", "errands"],
    "settings": {
      "allow_manual_column_move": true,
      "card_retention_days": null
    },
    "categories": [
      {
        "slug": "personal-secretary",
        "name": "Personal Secretary",
        "color": "#8b5cf6",
        "icon": "bot",
        "skills": [
          {
            "slug": "personal-task-planner",
            "name": "Personal Task Planner",
            "description": "Breaks down personal tasks into actionable steps, estimates effort, and suggests the best approach.",
            "instructions": "You are a personal secretary AI assistant. You help organize and plan everyday personal tasks.\n\nWhen given a personal task (errands, appointments, repairs, shopping, etc.), you:\n1. Break it down into clear, actionable steps\n2. Identify what information is needed\n3. Suggest the most efficient approach\n4. Flag any time-sensitive aspects\n5. Provide helpful tips\n\n## Task categories: Health, Home, Family, Shopping, Finance, Admin, Social\n\n## Output:\n- Priority: High / Medium / Low\n- Steps with specific details\n- What you''ll need (documents, info, items)\n- Best time to do this\n- Tips and advice",
            "is_active": true
          },
          {
            "slug": "personal-research-assistant",
            "name": "Research Assistant",
            "description": "Researches options, compares prices, finds local services, and provides recommendations.",
            "instructions": "You are a personal research assistant. You help find the best options for everyday personal needs.\n\n## What you research: Local services, Products, Solutions (DIY vs pro), Places, Information (regulations, deadlines)\n\n## Output:\n- Summary of findings\n- Options ranked best to worst with cost and notes\n- Recommendation with reasoning\n- Next steps",
            "is_active": true
          },
          {
            "slug": "personal-message-drafter",
            "name": "Message Drafter",
            "description": "Drafts messages for WhatsApp, email, or phone calls — scheduling appointments, making inquiries, or following up.",
            "instructions": "You are a personal communication assistant. You draft messages and call scripts.\n\n## Types: Appointment scheduling, Inquiries, Follow-ups, Complaints, RSVP, Reminders\n\n## Formats:\n- WhatsApp/SMS: Short, 2-4 sentences\n- Email: Subject + concise body\n- Phone: Who to call, best time, script with key points\n\n## Guidelines:\n- Keep messages short and clear\n- Be polite but direct\n- Include all necessary info\n- For appointments: suggest 2-3 time slots",
            "is_active": true
          },
          {
            "slug": "personal-reminder-scheduler",
            "name": "Reminder & Follow-up Scheduler",
            "description": "Creates reminder schedules, follow-up plans, and recurring task patterns.",
            "instructions": "You are a personal reminder and follow-up manager.\n\n## What you track: One-time events, Recurring tasks, Follow-ups, Seasonal items\n\n## Output:\n- Reminder times with lead time\n- Follow-up schedule with escalation\n- Recurring pattern if applicable\n- Dependencies between tasks",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "personal-health",
        "name": "Health & Wellness",
        "color": "#ef4444",
        "icon": "heart-pulse",
        "skills": [
          {
            "slug": "personal-health-organizer",
            "name": "Health Appointment Organizer",
            "description": "Helps organize medical appointments, track medications, and manage health-related logistics.",
            "instructions": "You are a health task organizer (NOT a medical advisor).\n\n## Help with: Appointment prep, Medication tracking, Insurance/Admin, Follow-ups\n\n## Output: Checklists for before/after appointments, documents needed, questions to ask, time-sensitive items.\n\n## IMPORTANT: Never provide medical advice. Focus on logistics only.",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "personal-home",
        "name": "Home & Maintenance",
        "color": "#f59e0b",
        "icon": "home",
        "skills": [
          {
            "slug": "personal-home-maintenance",
            "name": "Home Maintenance Advisor",
            "description": "Helps plan home repairs, find service providers, and manage maintenance schedules.",
            "instructions": "You are a home maintenance planning assistant.\n\n## Help with: Troubleshooting, DIY vs Pro assessment, Finding professionals, Cost estimation, Maintenance schedules\n\n## Output:\n- Assessment (problem type, urgency, DIY feasible)\n- If DIY: tools, steps, cost, time estimate\n- If Professional: who to call, what to say, cost range, red flags\n- Prevention tips",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      },
      {
        "slug": "personal-shopping",
        "name": "Shopping & Purchases",
        "color": "#22c55e",
        "icon": "shopping-cart",
        "skills": [
          {
            "slug": "personal-purchase-advisor",
            "name": "Purchase Advisor",
            "description": "Helps research products, compare prices, and make smart purchasing decisions.",
            "instructions": "You are a personal shopping assistant.\n\n## Help with: Product research, Price comparison, Decision making, Shopping lists\n\n## Output:\n- Top picks ranked with pros, cons, and price\n- Recommendation with reasoning\n- Where and when to buy\n- Budget and premium options",
            "is_active": true
          }
        ],
        "knowledge_docs": []
      }
    ],
    "steps": [
      {
        "id": "inbox",
        "name": "Inbox",
        "type": "input",
        "position": 0,
        "color": "#71717a",
        "linked_category_slug": "personal-secretary",
        "ai_config": {
          "enabled": true,
          "ai_first": true,
          "system_prompt": "A new personal task has been added. Analyze it, categorize it, break it down into steps, and identify any time-sensitive aspects. Provide a clear action plan."
        },
        "fields": {
          "inputs": [
            { "key": "description", "label": "What do you need to do?", "type": "text", "required": true },
            { "key": "category", "label": "Category", "type": "dropdown", "options": ["Health", "Home", "Family", "Shopping", "Finance", "Admin", "Social", "Other"] },
            { "key": "deadline", "label": "Deadline", "type": "date" },
            { "key": "urgency", "label": "Urgency", "type": "dropdown", "options": ["Urgent", "This Week", "This Month", "Someday"] }
          ],
          "outputs": []
        },
        "on_complete": "planning",
        "on_error": null
      },
      {
        "id": "planning",
        "name": "Planning",
        "type": "ai_process",
        "position": 1,
        "color": "#8b5cf6",
        "linked_category_slug": "personal-secretary",
        "ai_config": {
          "enabled": true,
          "ai_first": true,
          "system_prompt": "Create a detailed action plan for this personal task. Research if needed, draft any messages, set up reminders, and provide step-by-step guidance."
        },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "action_plan", "label": "Action Plan", "type": "text", "required": true },
            { "key": "messages_to_send", "label": "Messages to Send", "type": "text" },
            { "key": "items_needed", "label": "Items / Info Needed", "type": "text" },
            { "key": "estimated_cost", "label": "Estimated Cost", "type": "text" }
          ]
        },
        "on_complete": "in-progress",
        "on_error": "inbox"
      },
      {
        "id": "in-progress",
        "name": "In Progress",
        "type": "human_review",
        "position": 2,
        "color": "#3b82f6",
        "linked_category_slug": null,
        "ai_config": { "enabled": false },
        "fields": { "inputs": [], "outputs": [] },
        "on_complete": "waiting",
        "on_error": null
      },
      {
        "id": "waiting",
        "name": "Waiting On",
        "type": "human_review",
        "position": 3,
        "color": "#f59e0b",
        "linked_category_slug": "personal-secretary",
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [
            { "key": "waiting_for", "label": "Waiting for", "type": "text", "required": true },
            { "key": "follow_up_date", "label": "Follow up by", "type": "date" }
          ],
          "outputs": []
        },
        "on_complete": "done",
        "on_error": "in-progress"
      },
      {
        "id": "done",
        "name": "Done",
        "type": "done",
        "position": 5,
        "color": "#22c55e",
        "linked_category_slug": null,
        "ai_config": { "enabled": false },
        "fields": {
          "inputs": [],
          "outputs": [
            { "key": "outcome", "label": "Outcome / Notes", "type": "text" },
            { "key": "total_cost", "label": "Total Cost", "type": "text" },
            { "key": "follow_up_needed", "label": "Future Follow-up Needed?", "type": "boolean" }
          ]
        }
      }
    ]
  }'::jsonb,
  '1.0',
  '1.0.0',
  TRUE,
  TRUE,
  NOW(),
  'TaskClaw',
  'system@taskclaw.co'
)
ON CONFLICT DO NOTHING;
