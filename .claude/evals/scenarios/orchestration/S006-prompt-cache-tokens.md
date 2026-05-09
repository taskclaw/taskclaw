# S006: Prompt caching saves tokens on second message

## Preconditions
- Workspace uses Anthropic backbone (Claude model)
- Cockpit open with existing conversation

## Steps
1. Send message 1: "summarize the workspace"
2. Immediately send message 2: "which pod has the most boards?"
3. Check backend execution logs for both messages

## Expected Results
- Message 1 execution log metadata: cache_creation_input_tokens > 0, cache_read_input_tokens = 0
- Message 2 execution log metadata: cache_read_input_tokens > 0 (cache hit on stable workspace context block)
- Message 2 total input token cost lower than message 1 for the same stable context

## Notes
- Must be within 5-minute window for Anthropic cache TTL to apply
- Test requires backend execution log to expose cache stats (stored in metadata JSONB)

## Viewports
- N/A (backend verification via DB query or API)
