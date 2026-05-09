# S001: Cockpit has workspace context

## Preconditions
- Workspace has at least 2 pods with boards
- Backend running, frontend running
- Logged in as workspace owner

## Steps
1. Open the Cockpit (workspace-level chat)
2. Type: "what pods do I have?"
3. Wait for AI response

## Expected Results
- AI response lists the actual pod names from the workspace (not generic placeholders)
- Response mentions each pod's board count or key boards
- Response does NOT say "I don't have information about your workspace" or ask clarifying questions

## Viewports
- Desktop: 1280x720
