/**
 * Shallow camelCase → snake_case key converter for Drizzle rows.
 *
 * WHY. Drizzle returns columns under their camelCase JS keys
 * (`boardInstanceId`, `createdAt`, `triggerType`), but the frontend
 * contracts — and the shape PostgREST used to return — are snake_case
 * (`board_instance_id`, `created_at`, `trigger_type`). Services that
 * spread a residual row (`...rest`) or return a raw row therefore leak
 * camelCase for every multi-word column; single-word columns (`id`,
 * `name`, `status`) are identical in both casings, which is why the leak
 * is silent — the value just arrives as `undefined` on the client.
 *
 * SHALLOW ON PURPOSE. Only the row's own top-level keys are renamed; the
 * VALUES are passed through untouched. That is what makes this jsonb-safe:
 * a `cardData: { someUserKey: 1 }` column becomes `card_data: { someUserKey: 1 }`
 * — the column key is converted, but the arbitrary user/external keys inside
 * the jsonb value are preserved exactly. A deep converter would corrupt them.
 *
 * IDEMPOTENT. Keys that are already snake_case have no uppercase to convert,
 * so re-applying this to an already-presented row is a no-op. Safe to apply
 * defensively even where a `present()` helper already hand-maps relations.
 *
 * Nested relation objects (e.g. an embedded `board_steps[]` row) are NOT
 * recursed into — apply `snakeKeys` again at each spread site that introduces
 * camelCase relation columns.
 */
const toSnake = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

// Returns `Record<string, any>` (not `unknown`): callers spread the result
// into a response object and then read re-keyed columns off it
// (`row.board_count`, `row.id`). The `any` index signature propagates through
// the spread so those dynamic reads stay type-clean, matching the `row: any`
// convention the present() helpers already use.
export function snakeKeys<T extends Record<string, unknown>>(
  obj: T,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toSnake(k)] = v;
  }
  return out;
}
