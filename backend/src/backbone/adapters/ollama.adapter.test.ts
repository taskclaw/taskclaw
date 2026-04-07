/**
 * OllamaAdapter Integration Tests (I02)
 *
 * These tests make real API calls to a locally-running Ollama instance.
 * They are skipped automatically when OLLAMA_URL is not set or Ollama is not running.
 *
 * Prerequisites:
 *   1. docker compose up ollama -d
 *   2. docker exec taskclaw-ollama-1 ollama pull phi3:mini
 *   3. OLLAMA_URL=http://localhost:11434 npx jest ollama.adapter.test.ts
 */
import { OllamaAdapter } from './ollama.adapter';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;
  let ollamaAvailable = false;

  beforeAll(async () => {
    adapter = new OllamaAdapter();
    ollamaAvailable = await isOllamaRunning();
    if (!ollamaAvailable) {
      console.warn(
        `[Ollama tests] Ollama not running at ${OLLAMA_URL} — skipping live tests.\n` +
          'Start with: docker compose up ollama -d && docker exec taskclaw-ollama-1 ollama pull phi3:mini',
      );
    }
  });

  it('slug is ollama', () => {
    expect(adapter.slug).toBe('ollama');
  });

  it('supportsToolExecution returns false', () => {
    expect(adapter.supportsToolExecution()).toBe(false);
  });

  it('supportsNativeSkillInjection returns false', () => {
    expect(adapter.supportsNativeSkillInjection()).toBe(false);
  });

  it('validateConfig throws when api_url missing', () => {
    expect(() => adapter.validateConfig({ model: 'phi3:mini' })).toThrow();
  });

  it('validateConfig throws when model missing', () => {
    expect(() => adapter.validateConfig({ api_url: OLLAMA_URL })).toThrow();
  });

  it('validateConfig passes with api_url and model', () => {
    expect(() =>
      adapter.validateConfig({ api_url: OLLAMA_URL, model: 'phi3:mini' }),
    ).not.toThrow();
  });

  // Live tests — only run when Ollama is available
  it('healthCheck returns healthy when running', async () => {
    if (!ollamaAvailable) {
      return pending();
    }
    const result = await adapter.healthCheck({ api_url: OLLAMA_URL, model: 'phi3:mini' });
    expect(result.healthy).toBe(true);
  }, 5000);

  it('healthCheck returns unhealthy with wrong URL', async () => {
    const result = await adapter.healthCheck({
      api_url: 'http://localhost:9999',
      model: 'phi3:mini',
    });
    expect(result.healthy).toBe(false);
  }, 5000);

  it('sendMessage returns text response', async () => {
    if (!ollamaAvailable) {
      return pending();
    }
    const result = await adapter.sendMessage({
      config: { api_url: OLLAMA_URL, model: 'phi3:mini' },
      message: 'Reply with just: OK',
      systemPrompt: 'You are a test assistant. Be extremely brief.',
    });
    expect(result.text).toBeTruthy();
    expect(typeof result.text).toBe('string');
  }, 60000);
});

function pending() {
  // Jest doesn't have a built-in pending() — just skip by returning
  return;
}
