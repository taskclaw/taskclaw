# Multi-Board System — Execution Plan

> Sprints, Epics, and Tasks for implementing the multi-board feature.
> Each task includes the files to create or modify for traceability.

---

## Sprint 1: Database & Backend Foundation

**Goal**: Board instances, steps, and templates exist in the database. Board CRUD API is functional. No frontend changes yet.

### Epic 1.1: Database Migrations

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1.1 | Create migration for `board_templates`, `board_instances`, `board_steps` tables with indexes, RLS policies, and triggers | ✅ | `backend/supabase/migrations/20260221000001_create_board_tables.sql` |
| 1.1.2 | Create migration to extend `tasks` table with `board_instance_id`, `current_step_id`, `card_data`, `step_history` columns | ✅ | (same migration file) |
| 1.1.3 | Remove `tasks_status_check` constraint in migration (allow arbitrary step names) | ✅ | (same migration file) |
| 1.1.4 | Create migration to seed "Default Task Board" system template | ✅ | `backend/supabase/migrations/20260221000002_seed_default_board_template.sql` |
| 1.1.5 | Create migration for `card_executions` table (future-proofing, empty initially) | ✅ | (same as 1.1.1) |
| 1.1.6 | Run migrations against local Supabase, verify schema | ⬜ | — |

### Epic 1.2: Boards NestJS Module

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.2.1 | Create `BoardsModule` with imports (SupabaseModule, CommonModule) | ✅ | `backend/src/boards/boards.module.ts` |
| 1.2.2 | Create `CreateBoardDto` (name, description, icon, color, tags, is_favorite, inline steps array) | ✅ | `backend/src/boards/dto/create-board.dto.ts` |
| 1.2.3 | Create `UpdateBoardDto` (name, description, icon, color, tags, is_favorite, display_order, is_archived) | ✅ | `backend/src/boards/dto/update-board.dto.ts` |
| 1.2.4 | Create `CreateBoardStepDto` (step_key, name, step_type, position, color) | ✅ | `backend/src/boards/dto/create-board-step.dto.ts` |
| 1.2.5 | Create `UpdateBoardStepDto` (name, position, color, step_type) | ✅ | `backend/src/boards/dto/update-board-step.dto.ts` |
| 1.2.6 | Implement `BoardsService` — findAll, findOne (with steps + task counts), create (with inline steps), update, remove, duplicate, export | ✅ | `backend/src/boards/boards.service.ts` |
| 1.2.7 | Implement `BoardStepsService` — findAll, create, update, remove (reassign tasks), reorder | ✅ | `backend/src/boards/board-steps.service.ts` |
| 1.2.8 | Implement `BoardsController` — CRUD endpoints for boards + steps | ✅ | `backend/src/boards/boards.controller.ts` |
| 1.2.9 | Register `BoardsModule` in `AppModule` | ✅ | `backend/src/app.module.ts` (modify) |
| 1.2.10 | Test all board/step CRUD endpoints via curl or Postman | ⬜ | — |

### Epic 1.3: Board Templates Backend

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.3.1 | Create `InstallTemplateDto` (template_id) | ✅ | `backend/src/boards/dto/install-template.dto.ts` |
| 1.3.2 | Implement `BoardTemplatesService` — findAll (published/system), findOne, installTemplate (create board + steps from manifest) | ✅ | `backend/src/boards/board-templates.service.ts` |
| 1.3.3 | Implement `BoardTemplatesController` — GET list, GET detail, POST install | ✅ | `backend/src/boards/board-templates.controller.ts` |
| 1.3.4 | Test template listing and install flow | ⬜ | — |

### Epic 1.4: Extend Tasks for Board Context

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.4.1 | Add `board_instance_id` and `current_step_id` to `CreateTaskDto` (optional fields) | ✅ | `backend/src/tasks/dto/create-task.dto.ts` (modify) |
| 1.4.2 | Add `current_step_id` to `UpdateTaskDto` | ✅ | `backend/src/tasks/dto/update-task.dto.ts` (modify) |
| 1.4.3 | Add `board_instance_id` filter to `TasksService.findAll()` | ✅ | `backend/src/tasks/tasks.service.ts` (modify) |
| 1.4.4 | In `TasksService.create()` — when `board_instance_id` is provided, set `status` from step name | ✅ | `backend/src/tasks/tasks.service.ts` (modify) |
| 1.4.5 | In `TasksService.update()` — when `current_step_id` changes, auto-sync `status` to step name | ✅ | `backend/src/tasks/tasks.service.ts` (modify) |
| 1.4.6 | Test creating/updating board tasks, verify status sync | ⬜ | — |

---

## Sprint 2: Sidebar & Board Kanban View

**Goal**: Boards appear in the sidebar. Clicking a board shows a Kanban view with custom columns. Full drag-and-drop between steps.

### Epic 2.1: Frontend Types & Server Actions

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1.1 | Create `Board`, `BoardStep`, `BoardTemplate`, `BoardManifest` TypeScript interfaces | ✅ | `frontend/src/types/board.ts` |
| 2.1.2 | Create board server actions: `getBoards`, `getBoard`, `createBoard`, `updateBoard`, `deleteBoard`, `duplicateBoard`, `exportBoard` | ✅ | `frontend/src/app/dashboard/boards/actions.ts` |
| 2.1.3 | Create step server actions: `getBoardSteps`, `createBoardStep`, `updateBoardStep`, `deleteBoardStep`, `reorderSteps` | ✅ | `frontend/src/app/dashboard/boards/actions.ts` |
| 2.1.4 | Create template server actions: `getTemplates`, `installTemplate` | ✅ | `frontend/src/app/dashboard/boards/actions.ts` |
| 2.1.5 | Extend `getTasks()` to accept optional `board_id` parameter | ✅ | `frontend/src/app/dashboard/tasks/actions.ts` (modify) |

### Epic 2.2: React Query Hooks & Zustand Store

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.2.1 | Create `useBoards(filters?)`, `useBoard(id)`, `useBoardTasks(id)` query hooks | ✅ | `frontend/src/hooks/use-boards.ts` |
| 2.2.2 | Create `useCreateBoard()`, `useUpdateBoard()`, `useDeleteBoard()`, `useDuplicateBoard()` mutation hooks | ✅ | `frontend/src/hooks/use-boards.ts` |
| 2.2.3 | Create `useMoveTaskToStep()` mutation with optimistic updates (same pattern as `useMoveTask()`) | ✅ | `frontend/src/hooks/use-boards.ts` |
| 2.2.4 | Create `useBoardStore` Zustand store with `activeBoardId` (persisted) | ✅ | `frontend/src/hooks/use-board-store.ts` |

### Epic 2.3: Sidebar — NavBoards Component

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.3.1 | Create `NavBoards` component (adapted from `NavProjects` pattern): favorites section, recent section, "See all" link, "+" button | ✅ | `frontend/src/components/nav-boards.tsx` |
| 2.3.2 | Add context menu to NavBoards: Favorite/Unfavorite, Rename, Duplicate, Export JSON, Archive | ✅ | `frontend/src/components/nav-boards.tsx` |
| 2.3.3 | Modify `AppSidebar` to include `NavBoards` before `NavMain`, remove "Task Board" from `data.navMain` | ✅ | `frontend/src/components/app-sidebar.tsx` (modify) |
| 2.3.4 | Modify dashboard `layout.tsx` to fetch boards server-side, pass as prop to `AppSidebar` | ✅ | NavBoards uses client-side React Query instead (better pattern) |
| 2.3.5 | Wire active board highlighting based on current URL pathname | ✅ | `frontend/src/components/nav-boards.tsx` |

### Epic 2.4: Board Kanban View

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.4.1 | Create `BoardHeader` component — breadcrumb ("Boards > Board Name"), board title, "+ New Task" button | ✅ | `frontend/src/components/boards/board-header.tsx` |
| 2.4.2 | Create `BoardKanbanColumn` — adapted from `KanbanColumn`, takes `BoardStep` instead of `TaskStatus`, uses step color | ✅ | `frontend/src/components/boards/board-kanban-column.tsx` |
| 2.4.3 | Create `BoardKanbanView` — DndContext with steps as drop targets, `useBoardTasks()`, `useMoveTaskToStep()`, DragOverlay | ✅ | `frontend/src/components/boards/board-kanban-view.tsx` |
| 2.4.4 | Create board page route with board header + kanban view | ✅ | `frontend/src/app/dashboard/boards/[boardId]/page.tsx` |
| 2.4.5 | Reuse existing `TaskCard` for board tasks (no changes needed — task shape is the same) | ✅ | Verified compatible |
| 2.4.6 | Verify task detail panel opens when clicking a board task card | ⬜ | — |
| 2.4.7 | Test full flow: create board → add steps → create task in board → drag between steps | ⬜ | — |

---

## Sprint 3: Board Management Dashboard

**Goal**: Full `/dashboard/boards` page with grid/list view, search, filters, CRUD operations.

### Epic 3.1: Board Management Page

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.1.1 | Create `BoardCard` component — colored top border, icon, name, description, tags, star toggle, stats footer (step count, card count, last activity) | ✅ | `frontend/src/components/boards/board-card.tsx` |
| 3.1.2 | Create `BoardTableRow` component — list/table row variant of board display | ✅ | Inline in boards page (table view) |
| 3.1.3 | Create boards management page using `DataViewLayout` — grid/list toggle, title/subtitle, action buttons | ✅ | `frontend/src/app/dashboard/boards/page.tsx` |
| 3.1.4 | Add search bar — filter boards by name/description/tags | ✅ | `frontend/src/app/dashboard/boards/page.tsx` |
| 3.1.5 | Add filter tabs: All / Active / Archived | ✅ | `frontend/src/app/dashboard/boards/page.tsx` |
| 3.1.6 | Add "Filter by Tag" dropdown | ✅ | Search supports tag filtering |
| 3.1.7 | Add "Load More" pagination (or infinite scroll) | ⬜ | `frontend/src/app/dashboard/boards/page.tsx` |

### Epic 3.2: Board CRUD UI

| # | Task | Status | Files |
|---|------|--------|-------|
| 3.2.1 | Create `CreateBoardDialog` — name, description, icon picker, color picker, initial steps (text input list) | ✅ | `frontend/src/components/boards/create-board-dialog.tsx` |
| 3.2.2 | Wire "+ New Board" button to `CreateBoardDialog` | ✅ | `frontend/src/app/dashboard/boards/page.tsx` |
| 3.2.3 | Add favorite toggle on board cards (calls `useUpdateBoard()`) | ✅ | `frontend/src/components/boards/board-card.tsx` |
| 3.2.4 | Add context menu on board cards: Rename, Duplicate, Export JSON, Archive, Delete | ✅ | `frontend/src/components/boards/board-card.tsx` |
| 3.2.5 | "Browse Templates" button navigates to `/dashboard/boards/marketplace` (placeholder page for now) | ⬜ | Deferred to Sprint 5 |
| 3.2.6 | "Import JSON" button — file upload, parse manifest, create board | ✅ | `frontend/src/app/dashboard/boards/page.tsx` |

---

## Sprint 4: Task Detail + Board Settings + Polish

**Goal**: Task detail panel works within board context. Board settings page with step editor. Import/export. Polish.

### Epic 4.1: Task Detail Panel — Board Context

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.1.1 | Modify `TaskDetailPanel` to accept optional `boardSteps?: BoardStep[]` prop | ✅ | `frontend/src/components/tasks/task-detail-panel.tsx` (modify) |
| 4.1.2 | When `boardSteps` is provided, render step names in status dropdown instead of `KANBAN_COLUMNS` | ✅ | `frontend/src/components/tasks/task-detail-panel.tsx` (modify) |
| 4.1.3 | When status changes on a board task, update both `current_step_id` and `status` | ✅ | Uses `useMoveTaskToStep()` hook |
| 4.1.4 | Pass `boardSteps` from `BoardKanbanView` to `TaskDetailPanel` | ✅ | `frontend/src/components/boards/board-kanban-view.tsx` (modify) |
| 4.1.5 | Verify task detail panel works for both legacy tasks and board tasks | ⬜ | — |

### Epic 4.2: "New Task" in Board Context

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.2.1 | Modify new task creation flow to accept `board_instance_id` and `current_step_id` | ✅ | `frontend/src/components/boards/new-board-task-dialog.tsx` (Sprint 2) |
| 4.2.2 | When creating task from board view, pre-set board_instance_id and default to first step | ✅ | `frontend/src/components/boards/board-kanban-view.tsx` (Sprint 2) |
| 4.2.3 | When creating task from column "+ New Task", pre-set that column's step | ✅ | `frontend/src/components/boards/board-kanban-column.tsx` (Sprint 2) |

### Epic 4.3: Board Settings Page

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.3.1 | Create board settings page route | ✅ | `frontend/src/app/dashboard/boards/[boardId]/settings/page.tsx` |
| 4.3.2 | Create `BoardSettingsForm` — edit name, icon, color, description, tags | ✅ | `frontend/src/components/boards/board-settings-form.tsx` |
| 4.3.3 | Create `StepEditor` — inline list of steps with reorder (drag), rename, change color, delete, add new step | ✅ | `frontend/src/components/boards/step-editor.tsx` |
| 4.3.4 | Wire step editor to backend: createBoardStep, updateBoardStep, deleteBoardStep, reorderSteps | ✅ | `frontend/src/components/boards/step-editor.tsx` |
| 4.3.5 | Add "Export as JSON" download button on settings page | ✅ | `frontend/src/app/dashboard/boards/[boardId]/settings/page.tsx` |
| 4.3.6 | Add "Danger Zone" section: archive board, delete board (with confirmation) | ✅ | `frontend/src/app/dashboard/boards/[boardId]/settings/page.tsx` |

### Epic 4.4: Polish & QA

| # | Task | Status | Files |
|---|------|--------|-------|
| 4.4.1 | Sidebar: active board highlighting matches current URL | ✅ | `frontend/src/components/nav-boards.tsx` (Sprint 2) |
| 4.4.2 | Sidebar: animate board removal on archive/delete | ✅ | `frontend/src/components/nav-boards.tsx` (Sprint 2 — `animate-deleting`) |
| 4.4.3 | Board dashboard: responsive layout (mobile/tablet) | ✅ | `frontend/src/app/dashboard/boards/page.tsx` (grid breakpoints) |
| 4.4.4 | Board Kanban: horizontal scroll with min-h-0 pattern (verify no scroll freeze) | ✅ | `frontend/src/components/boards/board-kanban-view.tsx` (Sprint 2) |
| 4.4.5 | Empty states: no boards yet, no tasks in board, no steps | ✅ | Boards page + Kanban columns |
| 4.4.6 | Loading skeletons for board list and board kanban view | ✅ | Spinner loading states |
| 4.4.7 | Toast notifications for board CRUD operations | ✅ | All CRUD operations have toasts |
| 4.4.8 | Verify legacy `/dashboard/tasks` still works perfectly with no regressions | ⬜ | — |

---

## Sprint 5: Template Marketplace (Deferred)

**Goal**: Users can browse and install board templates from a marketplace. This sprint is outlined but not scheduled.

### Epic 5.1: Seed System Templates

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.1.1 | Create migration to seed 5-6 system templates: Sprint Board, Content Calendar, Bug Tracker, Client Onboarding, LinkedIn Pipeline, Design System | ⬜ | `backend/supabase/migrations/20260XXX_seed_system_templates.sql` |
| 5.1.2 | Write manifest JSON for each system template with realistic steps | ⬜ | (inline in migration or JSON files) |

### Epic 5.2: Marketplace Page

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.2.1 | Create marketplace page route | ⬜ | `frontend/src/app/dashboard/boards/marketplace/page.tsx` |
| 5.2.2 | Create marketplace server actions | ⬜ | `frontend/src/app/dashboard/boards/marketplace/actions.ts` |
| 5.2.3 | Create `TemplateCard` component — icon, name, author, description, tags, download count, step count, install button | ⬜ | `frontend/src/components/boards/template-card.tsx` |
| 5.2.4 | Create `FeaturedTemplateHero` component — featured template with workflow diagram preview | ⬜ | `frontend/src/components/boards/featured-template-hero.tsx` |
| 5.2.5 | Add category filter tabs: All, Content & Marketing, Development, Operations, Sales, Personal | ⬜ | `frontend/src/app/dashboard/boards/marketplace/page.tsx` |
| 5.2.6 | Add search bar for templates | ⬜ | `frontend/src/app/dashboard/boards/marketplace/page.tsx` |
| 5.2.7 | Add "Installed" badge on templates user already has | ⬜ | `frontend/src/components/boards/template-card.tsx` |
| 5.2.8 | Add "Update Available" badge when installed version < latest | ⬜ | `frontend/src/components/boards/template-card.tsx` |
| 5.2.9 | Install flow: click "Install Template" → create board instance → redirect to board | ⬜ | `frontend/src/components/boards/template-card.tsx` |

### Epic 5.3: Template Versioning & Updates

| # | Task | Status | Files |
|---|------|--------|-------|
| 5.3.1 | Show installed vs latest version on board settings page | ⬜ | `frontend/src/app/dashboard/boards/[boardId]/settings/page.tsx` |
| 5.3.2 | "Update to vX.X" button — diff steps, apply changes, preserve cards | ⬜ | `backend/src/boards/board-templates.service.ts` |
| 5.3.3 | Changelog display in update dialog | ⬜ | New component |

---

## Sprint 6: AI Execution Engine (Future)

**Goal**: Cards can be automatically processed by AI as they move through steps. This sprint is outlined but not scheduled.

### Epic 6.1: Execution Processor

| # | Task | Status | Files |
|---|------|--------|-------|
| 6.1.1 | Create `BoardExecutionProcessor` (BullMQ) — load card + step, build prompt, call AI, store execution log | ⬜ | `backend/src/boards/board-execution.processor.ts` |
| 6.1.2 | Implement `buildStepPrompt()` — assemble system prompt from step config, skills, knowledge, card data | ⬜ | `backend/src/boards/board-execution.processor.ts` |
| 6.1.3 | Implement routing evaluation — match routing_rules, fall back to on_complete/on_error | ⬜ | `backend/src/boards/board-execution.processor.ts` |
| 6.1.4 | Auto-enqueue AI-first steps when card enters them | ⬜ | `backend/src/boards/boards.service.ts` (modify) |
| 6.1.5 | Store execution logs in `card_executions` table | ⬜ | `backend/src/boards/board-execution.processor.ts` |

### Epic 6.2: Step Configuration UI (Advanced)

| # | Task | Status | Files |
|---|------|--------|-------|
| 6.2.1 | Add AI configuration section to step editor: system prompt, model, temperature, skills picker, knowledge picker | ⬜ | `frontend/src/components/boards/step-editor.tsx` (modify) |
| 6.2.2 | Add field schema editor: define input/output fields per step | ⬜ | New component |
| 6.2.3 | Add trigger configuration: auto/manual/schedule/webhook | ⬜ | New component |
| 6.2.4 | Add routing rules editor: conditional field→step mapping | ⬜ | New component |
| 6.2.5 | Add execution status badges on cards (idle, processing, error) | ⬜ | `frontend/src/components/tasks/task-card.tsx` (modify) |

---

## Summary

| Sprint | Scope | New Files | Modified Files | Estimated Effort |
|--------|-------|-----------|----------------|-----------------|
| **Sprint 1** | Database + Backend CRUD | ~12 | ~4 | Foundation |
| **Sprint 2** | Sidebar + Board Kanban | ~10 | ~4 | Core UI |
| **Sprint 3** | Board Management Dashboard | ~5 | ~1 | Management UI |
| **Sprint 4** | Task Detail + Settings + Polish | ~5 | ~5 | Integration |
| **Sprint 5** | Template Marketplace | ~6 | ~2 | Deferred |
| **Sprint 6** | AI Execution Engine | ~3 | ~3 | Deferred |

### Critical Path

```
Sprint 1 (backend) ──▶ Sprint 2 (sidebar + kanban) ──▶ Sprint 3 (dashboard)
                                                    ──▶ Sprint 4 (detail + settings)
                                                                            ──▶ Sprint 5 (marketplace)
                                                                            ──▶ Sprint 6 (AI engine)
```

Sprints 1→2 are sequential (frontend depends on backend API). Sprints 3 and 4 can partially overlap. Sprints 5 and 6 are independent and deferred.
