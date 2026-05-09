# DAG Execution

TaskClaw's DAG (Directed Acyclic Graph) execution system turns a high-level goal into a structured set of tasks, gets human sign-off, then runs those tasks autonomously — respecting dependencies and reacting to AI refusals in real time.

## How It Works

1. **Goal decomposition** — A user writes a goal. An AI backbone decomposes it into a set of tasks with explicit dependencies, producing a DAG.
2. **Human approval** — The DAG is presented for review before anything runs. Approvers can inspect the plan and reject it before committing.
3. **Cascade execution** — Once approved, root tasks (tasks with no dependencies) start immediately. When a task completes, its dependents are unblocked and start automatically.
4. **Refusal detection** — If the AI backbone refuses a task (insufficient context, safety reasons, etc.), that task is marked **Needs Review** and the cascade halts for that branch. Other branches continue.

## Key Concepts

| Concept | Description |
|---|---|
| **Goal** | The plain-language objective the user wants to achieve |
| **DAG** | The full graph of tasks and their dependency relationships |
| **Root Task** | A task with no predecessors — starts as soon as the DAG is approved |
| **Cascade** | The automatic trigger of downstream tasks when their dependencies complete |
| **Refusal Detection** | Recognition that an AI backbone declined to execute a task (vs. a true failure) |
| **Board Visibility** | Each task in a DAG is a standard TaskClaw task, visible on the kanban board |

## DAG Statuses

| Status | Meaning |
|---|---|
| `pending_approval` | Created, waiting for a human to approve |
| `running` | Approved and actively executing |
| `completed` | All tasks finished successfully |
| `needs_review` | One or more tasks were refused by the AI; human intervention required |
| `failed` | A task failed with a hard error (non-refusal) |

## Task Statuses Inside a DAG

| Status | Meaning |
|---|---|
| **To-Do** | Waiting to be picked up (dependencies not yet met, or not yet started) |
| **In Progress** | AI backbone is actively working on it |
| **Done** | Completed successfully |
| **Needs Review** | AI refused the task; a human must inspect and decide next steps |
| **Blocked** | A dependency failed or was refused, so this task cannot proceed |

## Triggering a DAG

Approve a pending DAG via the API:

```http
POST /accounts/:accountId/board-routing/dags/:dagId/approve
Authorization: Bearer <token>
Content-Type: application/json
```

No request body is required. The backend will transition the DAG to `running` and begin the cascade.

## Database Tables

| Table | Key Columns |
|---|---|
| `task_dags` | `id`, `goal`, `status`, `account_id` |
| `tasks` | `id`, `dag_id`, `status`, `result` (AI output), `current_step_id` |
| `task_dependencies` | `task_id`, `depends_on_task_id` |
| `dag_approvals` | `dag_id`, `approved_by`, `approved_at` |

## Extending the Execution Engine

The core logic lives in three files under `backend/src/board-routing/`:

- **`coordinator.service.ts`** — Orchestrates the overall DAG lifecycle; entry point for approval and cascade logic
- **`dag-executor.service.ts`** — Handles per-task execution: spawns the backbone, captures output, writes the `result` column
- **`dag-approval.service.ts`** — Validates approval requests and transitions DAG status

To add custom behavior (e.g., notify on task completion, plug in a different backbone type), start with `dag-executor.service.ts` and the `onTaskCompleted` hook.

## Debugging

Stream relevant backend log lines in real time:

```bash
docker logs taskclaw-backend-1 | grep -E "(startDag|onTaskCompleted|Needs Review|DAG)"
```

Common signals to look for:

- `startDag` — DAG approved and cascade initiated
- `onTaskCompleted` — A task finished; downstream unblocking is happening
- `Needs Review` — A backbone refusal was detected
- `DAG completed` / `DAG failed` — Terminal state reached
