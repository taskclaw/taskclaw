# Full Orchestration E2E Test Plan
# 10 scenarios from easy → hard
# Run with /chrome-cdp-control + /iterate

---

## T01 — Backend health (easiest)
**Goal:** Verify all new backend endpoints are reachable
**Steps:**
1. curl GET http://localhost:3003/health → 200
2. curl GET http://localhost:3003/accounts/:accountId/orchestrations (with auth) → 200 or 401

**Pass:** Both return expected HTTP codes, no 500s

---

## T02 — Workspace context in cockpit system prompt
**Goal:** Backend injects pod/board context into cockpit AI
**Steps:**
1. Open Cockpit chat at http://localhost:3002/dashboard/chat
2. Send: "what pods do I have?"
**Pass:** AI response lists actual pod names — NOT generic placeholders or "I don't have information"

---

## T03 — Pod settings: autonomy dial renders
**Goal:** AutonomyDial component is visible and interactive in pod settings
**Steps:**
1. Navigate to a pod's settings page: /dashboard/pods/[slug]/settings
2. Find the Autonomy section
3. Verify 4 segments are visible: Observe / Plan & Propose / Act with Confirmation / Act Autonomously
**Pass:** Autonomy dial renders with 4 clickable segments, current level highlighted

---

## T04 — Autonomy dial persists value
**Goal:** Clicking a segment saves autonomy_level to the DB
**Steps:**
1. On pod settings page, click "Plan & Propose" (level 2)
2. Reload the page
**Pass:** Level 2 is still selected after reload. Check via DB: SELECT autonomy_level FROM pods WHERE id = '...' → 2

---

## T05 — Create orchestration via API
**Goal:** POST /accounts/:id/orchestrations creates a valid DAG in the DB
**Steps:**
1. POST to http://localhost:3003/accounts/:accountId/orchestrations with body:
   { "goal": "Test E2E orchestration", "tasks": [{ "pod_id": "<valid_pod_id>", "goal": "Step 1: research", "input_context": {} }, { "pod_id": "<valid_pod_id>", "goal": "Step 2: report", "input_context": {}, "depends_on_indices": [0] }] }
2. GET /accounts/:accountId/orchestrations/:id
**Pass:** 201 on create, GET returns parent row + 2 child tasks with correct dep linking. Root task is pending_approval, leaf task is pending_approval.

---

## T06 — Approve orchestration transitions task statuses
**Goal:** POST /approve moves root tasks to pending, leaves leaf as pending_approval
**Steps:**
1. Create orchestration from T05
2. POST /accounts/:accountId/orchestrations/:id/approve
3. GET orchestration detail
**Pass:** Root task (no upstream dep) has status=pending. Leaf task (depends on root) stays pending_approval.

---

## T07 — Cockpit approval card appears when orchestration is pending
**Goal:** DAGApprovalCard renders inline in cockpit chat when polling detects pending_approval
**Steps:**
1. Create an orchestration via API (T05) — leave as pending_approval, do NOT approve
2. Open Cockpit chat page
3. Wait up to 20 seconds (polling interval is 15s)
**Pass:** A yellow "Orchestration approval required" card appears below the message list with the goal text, task table, and Approve/Reject buttons

---

## T08 — Approve via DAGApprovalCard in UI
**Goal:** Clicking Approve in the card calls the API and updates card state
**Steps:**
1. With approval card visible (T07)
2. Click "Approve"
3. Observe card state change
**Pass:** Card shows "Approved — execution started", buttons disappear. GET orchestration confirms root task status=pending (or running if dispatcher fires)

---

## T09 — Reject orchestration via UI
**Goal:** Clicking Reject cancels all tasks
**Steps:**
1. Create another orchestration via API
2. Wait for approval card to appear
3. Click "Reject"
**Pass:** Card shows "Rejected". GET orchestration confirms all child tasks have status=cancelled.

---

## T10 — Full cockpit → delegation → approval → timeline flow (hardest)
**Goal:** End-to-end: type a cross-pod goal → AI generates delegation plan → approval card → approve → timeline shows progress
**Steps:**
1. Open Cockpit
2. Type: "I need you to orchestrate a simple 2-step test: first ask the [Pod Name] pod to create a test task, then report completion"
3. Wait for AI response
4. If AI generates a delegate_to_pod tool call → verify DAGApprovalCard appears
5. Click Approve
6. Verify OrchestrationTimeline panel appears and shows tasks in running/completed state
**Pass:**
- AI response is context-aware (mentions actual pod names)
- DAGApprovalCard renders with correct task breakdown
- After approve: timeline appears and shows real-time status updates
- All tasks eventually reach completed or running state (not stuck in pending)

---

## Run Instructions
For T01–T06: use curl + DB queries
For T07–T10: use /chrome-cdp-control with real Chrome on localhost:9222

After each failure: run /iterate to diagnose + fix + re-verify
