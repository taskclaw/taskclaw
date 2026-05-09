# S001: Cockpit Panel — Idle to Live Transition

## Preconditions
- Frontend dev server running on localhost:3002
- Backend healthy at localhost:3003
- User logged in
- No active orchestrations running (all at terminal status)

## Steps
1. Navigate to http://localhost:3002/dashboard/cockpit
2. Observe the right panel content
3. Click "Open Workspace Chat" (or use existing chat)
4. Type in textarea: "delegate to boring-websites-pod: create a landing page for a plumber in Porto Alegre"
5. Submit with Meta+Enter
6. Wait up to 15 seconds for AI response

## Expected Results
- Step 2: Right panel shows "24H COMPANY TIMELINE" with past session history (idle state)
- Step 6: Within 5 seconds of AI responding, right panel transitions to show a live execution card
- Live card shows pod name "Boring Websites", a status badge (Needs approval OR Running), and the goal text
- No polling requests visible to /orchestrations/{id} in network tab (status via Realtime)
- Chat area is full width (no side-by-side execution column)

## Viewports
- Desktop: 1440x900
