# Drizzle conversion guide (Supabase PostgREST → Drizzle)

How to convert a NestJS service's data access from the Supabase client to Drizzle.
Reference implementations: `src/categories/categories.service.ts` (flat CRUD) and
`src/sources/sources.service.ts` (embedded select). Read those first.

## Setup in the service
- Replace `SupabaseService`/`SupabaseAdminService` constructor injection with
  `@Inject(DB) private readonly db: Db`. Keep other deps (AccessControlHelper, registries, etc).
- Imports: `import { DB, type Db } from '<rel>/db';` then `import { tableA, tableB } from '<rel>/db/schema';`
  and `import { and, eq, desc, asc, isNull, ne, lt, gt, inArray, or, sql, count } from 'drizzle-orm';`
  (import only what you use). `<rel>` is `../db` for `src/<module>/x.service.ts`, `../../db` for nested.
- Remove the `import ... from '@supabase/supabase-js'` and any `getClient()` helper.

## Query translation
| PostgREST | Drizzle |
|---|---|
| `.from('t').select('*').eq('a',x)` | `db.select().from(t).where(eq(t.aCamel, x))` |
| `.eq().eq()` | `where(and(eq(...), eq(...)))` |
| `.or('a.eq.1,b.eq.2')` | `where(or(eq(...), eq(...)))` |
| `.in('a',[...])` | `where(inArray(t.aCamel, [...]))` |
| `.is('a', null)` | `where(isNull(t.aCamel))` ; `.not('a','is',null)` → `isNotNull` |
| `.neq('a',x)` | `where(ne(t.aCamel, x))` |
| `.order('c',{ascending:false})` | `.orderBy(desc(t.cCamel))` (asc → `asc`) |
| `.range(o, o+n-1)` | `.limit(n).offset(o)` |
| `.limit(n)` | `.limit(n)` |
| `.single()` / `.maybeSingle()` | `.limit(1)` then take `[0]`. `single` threw on missing → keep the SAME NotFoundException/message. `maybeSingle` returned null → return `?? null`, don't throw. |
| `.select(...,{count:'exact'})` | run a parallel `db.select({ value: count() }).from(t).where(...)` for the total |
| `.insert(row).select().single()` | `db.insert(t).values(row).returning()` then `[0]` |
| `.insert(rows).select()` | `db.insert(t).values(rows).returning()` |
| `.upsert(row,{onConflict:'a',ignoreDuplicates:true})` | `.insert(t).values(row).onConflictDoNothing({target:[t.aCamel]}).returning()` |
| `.upsert(row,{onConflict:'a'})` (update) | `.insert(t).values(row).onConflictDoUpdate({target:[t.aCamel],set:{...}}).returning()` |
| `.update(patch).eq().select().single()` | `db.update(t).set(patch).where(...).returning()` then `[0]` |
| `.delete().eq()` | `db.delete(t).where(...)` (add `.returning()` if you need the count via `.length`) |
| atomic `x = x + n` | `db.update(t).set({ col: sql\`${t.col} + ${n}\` })` |
| `.rpc('fn', {args})` | `db.execute(sql\`select * from fn(${a}, ${b})\`)` → rows in `.rows`; vector search & DAG fns STAY as SQL functions |

## Embedded selects (`.select('*, rel(*)')`) — the tricky one
- Use the relational query: `db.query.<table>.findMany({ where, orderBy, with: { relName: true } })`
  (or `findFirst`). Find the relation name in `src/db/relations.ts` for that table.
- **The relation key usually differs from PostgREST's key**: Drizzle uses the relation name
  (e.g. `category`, `user`), PostgREST used the table/alias name (e.g. `categories`, `owner`).
  **Re-key in code to preserve the response shape** callers depend on. See `sources.service.ts`
  `present()`. For an aliased embed like `owner:users!owner_user_id(email)`, the relation is
  `user` → re-key to `owner` and pick `{ columns: { email: true } }`.

## Types
- `error`/`data` destructuring is gone — Drizzle THROWS on error. Wrap inserts in try/catch only
  where the original handled a specific case (unique violation → `e?.code === '23505'`). Preserve
  every explicit `NotFoundException`/`BadRequestException` and its exact message.
- `jsonb` columns are typed `unknown` (PostgREST left them `any`). Make helpers that consume them
  accept `unknown` and coerce, or cast at the boundary (`x as Record<string, any>`).
- snake_case DTOs: map field-by-field to the schema's camelCase keys for `.values()`/`.set()`.
  Only spread a DTO if all its keys are single-word already matching schema keys.
- Use `typeof table.$inferInsert` / `$inferSelect` for patch/return types when helpful.

## Preserve behavior exactly
- Keep every public method signature and return shape. Keep ordering, filters, status gates,
  log lines, and messages identical. Do NOT refactor unrelated code.
- `verifyAccountAccess(client, ...)` → `verifyAccountAccess(null, ...)` (helper ignores arg 1 now).
- Do NOT modify `schema.ts`, `relations.ts`, the module files, or other services.

## Tests
- If a `*.spec.ts` exists for the service, update it to use `createDrizzleMock()`
  (`src/__test__/mocks/drizzle.mock.ts`): `db.select.mockReturnValueOnce(db.makeBuilder([rows]))`
  for the builder API, and `db.query('table').findFirst.mockResolvedValue(row)` for relational.
  If no spec exists, do not create one (unless told to).

## Gotchas
- `.rpc('search_*_vector'/'increment_agent_stats'/DAG fns)` — vector search & DAG functions STAY
  as SQL: `await db.execute(sql\`select * from search_projects_vector(${JSON.stringify(emb)}::vector, ${k}, ${t})\`)`
  → read `.rows`, Zod-parse. `increment_agent_stats` → inline `db.update(agents).set({ col: sql\`${agents.col} + ${n}\` })`.
- **Do NOT write `const [x] = await db.insert(t)...returning()` when assigning to a strictly-typed
  variable** — TS infers `any[] | QueryResult<never>` and the destructure fails to compile. Use
  `const rows = await db.insert(t)...returning(); const x = rows[0];` instead.
- `.storage.*` (Supabase Storage) — leave those calls as-is for now (Epic 3 / MinIO); convert only
  the `.from()` DB queries in storage-touching services unless told otherwise.

## Done = your file has zero `@supabase` imports and the project still `tsc --noEmit` cleanly.
