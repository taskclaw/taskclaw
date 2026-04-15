# S003: Background Execution Surfaces in Panel

## Preconditions
- Frontend running on localhost:3002
- At least one orchestrated_task exists in the DB with status='running' or 'pending_approval'
  (Can be created manually: UPDATE orchestrated_tasks SET status='running' WHERE id='<any-id>')
- User is on /dashboard/cockpit with NO active chat conversation (fresh page load)

## Steps
1. Navigate to http://localhost:3002/dashboard/cockpit (no active chat)
2. Observe right panel immediately on load
3. Wait up to 5 seconds

## Expected Results
- Right panel transitions from idle (24H timeline) to live execution mode
- Shows "RUNNING NOW" section (Feed B) with the background orchestration card
- Card shows pod name, goal text, Running status badge
- This appeared WITHOUT the user sending any chat message (it's background execution)
- If user clicks on a task card with a linked task_id, the task drawer opens

## Viewports
- Desktop: 1440x900
