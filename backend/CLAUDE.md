# Backend conventions (TaskClaw)

## §12.3 — Parse, don't cast

**Rule.** Every value crossing a boundary into the backend MUST be
validated with Zod. Bare `as Foo` casts on cross-boundary values are
forbidden. This applies to:

- HTTP request bodies (`@Body() body: unknown` → Zod-parse → typed).
- Supabase query results when the row shape matters (use the schema
  next to the service; bare PostgREST type-tags aren't sufficient).
- Adapter return values that get persisted (Pod bundles, sync runner
  output, mention spawn payloads).
- MCP tool arguments and results.

**Why.** The marketplace will import Pod bundles from arbitrary
sources; CLI-backed adapters return data shaped by external programs
we don't control; PostgREST returns columns the migration may rename
without TS catching it.

**How to apply.**
- Co-locate a Zod schema next to every service that has external input.
  Export both the schema and `z.infer<>` type.
- Pod bundle import (`PodBundleService.import`) is the canonical
  example — it Zod-parses the bundle BEFORE any DB write.
- DTOs may use class-validator OR Zod; new code should prefer Zod for
  consistency with the schemas we ship to the frontend.

Allowed casts: `as const`, casts to a narrower type you already own
(e.g. `'idle' as AgentStatus` from a literal), test fixtures.

## §12.4 — BackboneAdapter shape uniformity

Every adapter under `src/backbone/adapters/*.ts` MUST implement the
same surface. The conformance test
(`src/backbone/adapters/adapter-conformance.spec.ts`) asserts:

- `slug` is a non-empty string
- `sendMessage`, `healthCheck`, `validateConfig` are functions
- Optional methods (`transformSystemPrompt`,
  `supportsNativeSkillInjection`, `supportsToolExecution`) are either
  absent or callable

Adapters that can split their output into typed segments (Anthropic
today, others later) populate `BackboneSendResult.segments` so callers
can persist `messages` rows with the right `kind`. Adapters that can't
leave it undefined; the caller falls back to writing a single `text`
segment.

## FEATURE_TASK_RUNS_V2

Shadow-write flag for the `task_runs` audit table (PRD §10.1). When
`true`, `BackboneDispatchProcessor` writes a parallel run row per job;
when `false`, all `TaskRunsService.*` calls are no-ops. Default: true
in docker-compose, off-by-default for fresh local installs.

## Codebase pointers

- Module wiring: `src/app.module.ts` is the canonical list. New module?
  Import + add to `imports[]`.
- Encryption helpers: `src/common/utils/encryption.util.ts`. Use
  `encrypt()` / `decrypt()` for any secret stored in JSONB or text.
- Service-role DB access: `SupabaseAdminService.getClient()`. RLS-respecting
  user calls go through `SupabaseService.getAuthClient(token)`.
