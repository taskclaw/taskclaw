# Frontend conventions (TaskClaw)

This file pins down the rules that survive between Claude sessions. Each
rule has a one-line "why" — when in doubt, fall back to the why and decide.

## §12.1 — WebSocket events MUST invalidate TanStack Query, never write Zustand directly

**Rule.** Realtime WebSocket events (Supabase Realtime, AG-UI streaming)
MUST trigger TanStack Query cache invalidation. They MUST NOT call
`useSomeStore.setState`, `useSomeStore.getState().set*`, or any Zustand
mutator from inside a WS event handler.

**Why.** Server state has exactly one home: TanStack Query. Letting WS
handlers write Zustand creates three sources of truth (DB, Query cache,
Zustand) and the Realtime path silently diverges from REST.

**How to apply.** Inside any `onmessage` / `subscribe` callback:
- ✅ `queryClient.invalidateQueries({ queryKey: [...] })`
- ✅ `queryClient.setQueryData([...], (old) => ...)` (optimistic)
- ❌ `useTaskStore.setState({ ... })`
- ❌ `useTaskStore.getState().setSelectedTaskId(...)` (within WS callback only)

User-driven UI mutations against Zustand are still fine — the rule is
specifically about *server* state arriving over the wire.

The `no-restricted-syntax` rule in `eslint.config.mjs` catches the most
common violation pattern (Zustand mutators inside `subscribe(...)` and
`onmessage = ...` handlers).

## §12.3 — Parse, don't cast

**Rule.** Every value crossing a boundary (HTTP response on the client,
Supabase query result, MCP tool input/output, Pod bundle import) MUST be
validated with Zod. Bare `as Foo` casts on cross-boundary values are
forbidden.

**Why.** Desktop installs outlive server builds; the marketplace will
import Pod bundles from arbitrary sources; CLI adapters return data
shaped by external programs we don't control. Bare casts hide breakages
until runtime.

**How to apply.**
- ✅ `const skill = SkillSchema.parse(await fetchSkill(id))`
- ✅ `const skill = SkillSchema.safeParse(...)` then handle the failure
- ❌ `const skill = (await fetchSkill(id)) as Skill`
- ❌ `const data = response.data as MyType` (when `response` came from
     `fetch`, `supabase`, `useQuery`, MCP, or any external source)

Allowed casts: `as const`, casts to a more specific *value* you already
own (e.g. `'idle' as AgentStatus` from a constant), and casts inside
test fixtures.

The `no-restricted-syntax` rule warns on `as` casts applied directly to
the value of a `fetch().then` chain or a `supabase.from(...)` call.

## Codebase pointers

- Server actions live next to the page that consumes them
  (`actions.ts`). Always cookie-scoped Bearer auth, never anonymous.
- TanStack Query keys are arrays starting with the resource name:
  `['skills', accountId]`, `['task-runs', podId]`.
- Realtime subscriptions live in hooks under `frontend/src/hooks/use-*.ts`.
