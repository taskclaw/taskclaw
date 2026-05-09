import { OllamaAdapter } from './ollama.adapter';

// Only run if Ollama is available
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3:mini';

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;

  beforeAll(() => {
    adapter = new OllamaAdapter();
  });

  it.skip('should pass health check (requires Ollama running)', async () => {
    const result = await adapter.healthCheck({ api_url: OLLAMA_URL, model: OLLAMA_MODEL });
    expect(result.healthy).toBe(true);
  });

  it('should validate config - missing api_url', () => {
    expect(() => adapter.validateConfig({ model: 'phi3:mini' })).toThrow();
  });

  it('should validate config - missing model', () => {
    expect(() => adapter.validateConfig({ api_url: 'http://localhost:11434' })).toThrow();
  });

  it('should have slug = ollama', () => {
    expect(adapter.slug).toBe('ollama');
  });

  it('should not support tool execution', () => {
    expect(adapter.supportsToolExecution()).toBe(false);
  });
});
