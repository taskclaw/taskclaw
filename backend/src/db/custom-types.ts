import { customType } from 'drizzle-orm/pg-core';

/**
 * Postgres `tsvector` full-text-search type.
 *
 * drizzle-kit can't introspect `tsvector`, so the generated FTS columns
 * (`search_index` on pods/messages/etc.) come through as `unknown(...)`. These
 * columns are `GENERATED ALWAYS AS (to_tsvector(...))` — read-only — so the type
 * only needs to exist for schema completeness and GIN index declarations; the app
 * never writes them.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
