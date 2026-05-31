#!/usr/bin/env node
/**
 * S0.4 — curate the introspected Drizzle schema into the canonical src/db files.
 *
 * Transformations (string/template-literal aware so parens inside sql`...` and
 * quoted strings are never miscounted):
 *
 *   schema.ts:
 *     - strip every `pgPolicy(...)` call (we drop RLS; backend uses service-role)
 *     - `unknown("search_index")` → `tsvector("search_index")` (FTS generated cols)
 *     - drop the "// TODO: failed to parse database type 'tsvector'" comments
 *     - imports: drop `pgPolicy`/`unknown`, add `tsvector` from ./custom-types
 *
 *   relations.ts:
 *     - drop the stale `usersInAuth` import + every `usersInAuth: one(...)` block
 *       and the `usersInAuthRelations` export (FK to auth.users is intentionally
 *       dropped per the migration plan — users.id is a plain uuid PK)
 *
 * Verified afterwards by `tsc` + a live-DB runtime query smoke (not an empty-diff,
 * since we intentionally diverge from the source DB on RLS + the auth FK).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC_SCHEMA = 'drizzle/_introspect/schema.ts';
const SRC_RELS = 'drizzle/_introspect/relations.ts';
const OUT_SCHEMA = 'src/db/schema.ts';
const OUT_RELS = 'src/db/relations.ts';

/** Scan from an opening delimiter index to its match, skipping string/template bodies. */
function findMatch(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      // skip string/template literal body
      const quote = ch;
      i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) break;
        i++;
      }
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Remove every `callName(...)` plus a trailing comma and its indentation/newline. */
function stripCalls(text, callName) {
  let out = text;
  let count = 0;
  for (;;) {
    const idx = out.indexOf(callName + '(');
    if (idx === -1) break;
    const open = out.indexOf('(', idx);
    const closeIdx = findMatch(out, open, '(', ')');
    if (closeIdx === -1) throw new Error(`unbalanced ${callName} at ${idx}`);
    // expand left to swallow leading indentation/newline
    let start = idx;
    while (start > 0 && (out[start - 1] === '\t' || out[start - 1] === ' ')) start--;
    if (start > 0 && out[start - 1] === '\n') start--;
    // expand right to swallow a trailing comma
    let end = closeIdx + 1;
    if (out[end] === ',') end++;
    out = out.slice(0, start) + out.slice(end);
    count++;
  }
  return { out, count };
}

/** Remove every `key: one(...)` / `key: many(...)` relation entry for a given referenced table. */
function stripRelationEntries(text, refTable) {
  let out = text;
  let count = 0;
  for (;;) {
    // match `usersInAuth: one(` style keys (key name equals refTable here)
    const re = new RegExp(`\\b${refTable}:\\s*(one|many)\\(`);
    const m = re.exec(out);
    if (!m) break;
    const idx = m.index;
    const open = out.indexOf('(', idx + m[0].length - 1);
    const closeIdx = findMatch(out, open, '(', ')');
    if (closeIdx === -1) throw new Error(`unbalanced relation ${refTable}`);
    let start = idx;
    while (start > 0 && (out[start - 1] === '\t' || out[start - 1] === ' ')) start--;
    if (start > 0 && out[start - 1] === '\n') start--;
    let end = closeIdx + 1;
    if (out[end] === ',') end++;
    out = out.slice(0, start) + out.slice(end);
    count++;
  }
  return { out, count };
}

/** Remove a full `export const NAME = relations(...)( ... );` statement. */
function stripExportStatement(text, name) {
  const marker = `export const ${name} = relations(`;
  const idx = text.indexOf(marker);
  if (idx === -1) return { out: text, count: 0 };
  const open = text.indexOf('(', idx + marker.length - 1);
  const closeIdx = findMatch(text, open, '(', ')');
  // statement ends at the `;` after the relations(...) call's closing paren
  let end = closeIdx + 1;
  while (end < text.length && text[end] !== ';') end++;
  end++; // include ;
  // swallow trailing blank line
  if (text[end] === '\n') end++;
  return { out: text.slice(0, idx) + text.slice(end), count: 1 };
}

// ---- schema.ts ----
let schema = readFileSync(SRC_SCHEMA, 'utf8');
// drizzle-kit bug: empty-string column defaults are emitted as `.default(')`
// (unterminated). Fix to `.default("")`.
const emptyDefaults = (schema.match(/\.default\('\)/g) || []).length;
schema = schema.replace(/\.default\('\)/g, '.default("")');
const pol = stripCalls(schema, 'pgPolicy');
schema = pol.out;
schema = schema.replace(/[ \t]*\/\/ TODO: failed to parse database type 'tsvector'\n/g, '');
const tsvCount = (schema.match(/unknown\("search_index"\)/g) || []).length;
schema = schema.replace(/unknown\("search_index"\)/g, 'tsvector("search_index")');
// fix imports: drop pgPolicy + unknown from the drizzle-orm/pg-core import
schema = schema.replace(/^(import \{)([^}]*)(\} from "drizzle-orm\/pg-core")/m, (full, a, names, c) => {
  const kept = names
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'pgPolicy' && s !== 'unknown');
  return `${a} ${kept.join(', ')} ${c}`;
});
// add tsvector import after the first import line
schema = schema.replace(/(\n)/, `\nimport { tsvector } from "./custom-types";$1`);
writeFileSync(OUT_SCHEMA, schema);

// ---- relations.ts ----
let rels = readFileSync(SRC_RELS, 'utf8');
const relExport = stripExportStatement(rels, 'usersInAuthRelations');
rels = relExport.out;
const relEntries = stripRelationEntries(rels, 'usersInAuth');
rels = relEntries.out;
// drop usersInAuth from the import list
rels = rels.replace(/(\bimport \{[^}]*\} from "\.\/schema";)/, (imp) =>
  imp.replace(/,?\s*usersInAuth\b/, '').replace(/\{\s*,/, '{ '),
);
// fix relative import path (relations live in src/db now, schema is sibling)
writeFileSync(OUT_RELS, rels);

console.log(
  JSON.stringify({
    policiesStripped: pol.count,
    tsvectorFixed: tsvCount,
    usersInAuthEntries: relEntries.count,
    usersInAuthExport: relExport.count,
  }),
);
