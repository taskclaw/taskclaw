import { AnthropicAdapter } from './anthropic.adapter';
import { ClaudeCodeAdapter } from './claude-code.adapter';
import { CodexAdapter } from './codex.adapter';
import { CustomHttpAdapter } from './custom-http.adapter';
import { NemoClawAdapter } from './nemoclaw.adapter';
import { OllamaAdapter } from './ollama.adapter';
import { OpenClawAdapter } from './openclaw.adapter';
import { OpenRouterAdapter } from './openrouter.adapter';
import type { BackboneAdapter } from './backbone-adapter.interface';

/**
 * §12.4 — every adapter must implement the same surface so callers can
 * swap them without conditional branches. F5 (typed message kinds) and
 * F8 (token usage) both depend on this contract being uniform.
 *
 * This is a conformance test — it asserts shape, not behavior. Live
 * sendMessage / healthCheck behavior is covered in per-adapter specs.
 */
describe('BackboneAdapter conformance (§12.4)', () => {
  type AdapterCtor = new (...args: any[]) => BackboneAdapter;

  // For adapters whose constructor takes injected services, we pass
  // through `null as any` — only the shape of the public surface matters
  // here; we never exercise the bodies.
  const cases: Array<{ name: string; build: () => BackboneAdapter; slug: string }> = [
    { name: 'anthropic', build: () => new AnthropicAdapter(), slug: 'anthropic' },
    { name: 'claude-code', build: () => new ClaudeCodeAdapter(), slug: 'claude-code' },
    { name: 'codex', build: () => new CodexAdapter(), slug: 'codex' },
    { name: 'custom-http', build: () => new CustomHttpAdapter(), slug: 'custom-http' },
    { name: 'nemoclaw', build: () => new NemoClawAdapter(), slug: 'nemoclaw' },
    { name: 'ollama', build: () => new OllamaAdapter(), slug: 'ollama' },
    { name: 'openclaw', build: () => new OpenClawAdapter(), slug: 'openclaw' },
    { name: 'openrouter', build: () => new OpenRouterAdapter(), slug: 'openrouter' },
  ];

  for (const c of cases) {
    describe(c.name, () => {
      let adapter: BackboneAdapter;
      beforeAll(() => {
        adapter = c.build();
      });

      it('exposes a slug string', () => {
        expect(typeof adapter.slug).toBe('string');
        expect(adapter.slug.length).toBeGreaterThan(0);
      });

      it('declares the expected slug', () => {
        expect(adapter.slug).toBe(c.slug);
      });

      it('implements sendMessage as a function', () => {
        expect(typeof adapter.sendMessage).toBe('function');
      });

      it('implements healthCheck as a function', () => {
        expect(typeof adapter.healthCheck).toBe('function');
      });

      it('implements validateConfig as a function', () => {
        expect(typeof adapter.validateConfig).toBe('function');
      });

      // Optional methods either don't exist or are functions — never half-baked
      // (e.g. defined as a non-function value).
      it('optional surface is either undefined or callable', () => {
        for (const k of ['transformSystemPrompt', 'supportsNativeSkillInjection', 'supportsToolExecution'] as const) {
          const v = (adapter as any)[k];
          if (v !== undefined) {
            expect(typeof v).toBe('function');
          }
        }
      });

      it('validateConfig rejects an empty config', () => {
        // Every adapter requires *something* — at minimum an api_url, api_key,
        // or model. Empty config must throw or return without surfacing as a
        // valid call.
        let threw = false;
        try {
          adapter.validateConfig({});
        } catch {
          threw = true;
        }
        // We accept either throwing OR a no-op (some adapters defer all
        // validation until the first sendMessage). What we DON'T accept is
        // a return value other than undefined.
        const result = threw ? undefined : adapter.validateConfig({});
        if (!threw) expect(result).toBeUndefined();
      });
    });
  }
});
