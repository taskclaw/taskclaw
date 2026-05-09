# S003: DAG approval card approve/reject flow

## Preconditions
- A DAGApprovalCard is visible in Cockpit (from S002 or similar)

## Steps
1. Click "Approve" on the DAGApprovalCard
2. Observe status change in card and in orchestration timeline

## Expected Results
- Card transitions to "Approved" / "Running" state
- Orchestration timeline panel appears showing task progress
- Root tasks (no upstream deps) transition to "running" status
- Leaf tasks remain "pending" until root completes

## Reject flow:
1. In a new orchestration, click "Reject"
2. Expected: card transitions to "Rejected", no tasks start, explanation message in chat

## Viewports
- Desktop: 1280x720
