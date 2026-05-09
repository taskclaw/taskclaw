import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// PRD §12.1 + §12.3 — ban the most common violations of the rules
// documented in frontend/CLAUDE.md. These are heuristics (AST patterns
// can't fully prove "inside a WS handler" without a custom plugin), but
// they catch the bulk of real misuse and stay out of legitimate paths.
const taskclawRestrictedSyntax = [
  // §12.1 — Zustand mutator from inside a Realtime / WebSocket subscribe.
  // Matches: someChannel.subscribe(... useFooStore.setState(...))
  {
    selector:
      "CallExpression[callee.property.name='subscribe'] CallExpression[callee.object.name=/^use.*Store$/][callee.property.name='setState']",
    message:
      "PRD §12.1: WS subscribe handlers must invalidate TanStack Query, not write Zustand. See frontend/CLAUDE.md.",
  },
  {
    selector:
      "CallExpression[callee.property.name='on'] CallExpression[callee.object.name=/^use.*Store$/][callee.property.name='setState']",
    message:
      "PRD §12.1: WS .on('event') handlers must invalidate TanStack Query, not write Zustand. See frontend/CLAUDE.md.",
  },
  // §12.3 — bare TS cast on a fetch().then(...) return value.
  // Matches: (await fetch(...).then(r => r.json())) as Foo
  {
    selector:
      "TSAsExpression > AwaitExpression > CallExpression[callee.property.name='then'] > MemberExpression[object.callee.name='fetch']",
    message:
      "PRD §12.3: parse fetched JSON with Zod, don't cast. See frontend/CLAUDE.md.",
  },
  // §12.3 — bare TS cast on .data from a supabase query.
  {
    selector:
      "TSAsExpression > MemberExpression[property.name='data'][object.type='Identifier']:matches([object.name=/.*supabase.*/i])",
    message:
      "PRD §12.3: parse Supabase results with Zod before casting. See frontend/CLAUDE.md.",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "no-restricted-syntax": ["warn", ...taskclawRestrictedSyntax],
    },
  },
];

export default eslintConfig;
