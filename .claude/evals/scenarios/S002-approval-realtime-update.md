# S002: Approve Orchestration — Status Updates via Realtime

## Preconditions
- S001 completed: cockpit chat has sent a delegation, right panel shows a "Needs approval" card
- Card is yellow / pending_approval state with Approve and Cancel buttons visible

## Steps
1. Observe the card color and status badge (should be yellow, "Needs approval")
2. Open browser DevTools → Network tab → filter by WS (WebSocket)
3. Click "Approve" button on the card
4. Watch the card for status change

## Expected Results
- Step 2: A WebSocket connection to Supabase Realtime is visible (wss://*.supabase.co or similar)
- Step 4: Within 1 second of clicking Approve:
  - Card transitions from yellow border to blue border
  - Status badge changes from "Needs approval" to "Running"
  - Approve/Cancel buttons disappear
  - Task list appears (showing sub-tasks of the orchestration)
- NO XHR/fetch requests firing every 3s to /orchestrations/{id} after approval

## Viewports
- Desktop: 1440x900
