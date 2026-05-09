# S002: Cockpit decomposes and delegates cross-pod task

## Preconditions
- Workspace has "Boring Websites" pod and "Marketing" pod
- Both pods have at least one board each
- Backend running with OrchestrationService wired

## Steps
1. Open the Cockpit
2. Type: "Create 3 websites for shoe stores in Curitiba, Brazil, then post a thread on X about how we did it"
3. Wait for AI response

## Expected Results
- AI response identifies Boring Websites pod for the website work
- AI response identifies Marketing pod for the X thread
- AI proposes a DAG: websites first, thread after (dependency noted)
- A DAGApprovalCard appears inline showing the 2-task plan
- Approval card shows: goal, estimated tasks, pod assignments, dependency chain
- Approve and Reject buttons are visible

## Viewports
- Desktop: 1280x720
