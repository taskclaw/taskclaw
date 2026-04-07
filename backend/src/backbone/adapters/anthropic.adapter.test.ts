/**
 * AnthropicAdapter Integration Tests (I02)
 *
 * These tests make real API calls to Anthropic.
 * They are skipped automatically when ANTHROPIC_API_KEY is not set.
 *
 * Run: npx jest anthropic.adapter.test.ts --testEnvironment node
 */
import { AnthropicAdapter } from './anthropic.adapter';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const SKIP = !API_KEY;

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeAll(() => {
    adapter = new AnthropicAdapter();
  });

  it('slug is anthropic', () => {
    expect(adapter.slug).toBe('anthropic');
  });

  it('supportsToolExecution returns true', () => {
    expect(adapter.supportsToolExecution()).toBe(true);
  });

  it('supportsNativeSkillInjection returns true', () => {
    expect(adapter.supportsNativeSkillInjection()).toBe(true);
  });

  it('validateConfig throws when api_key missing', () => {
    expect(() => adapter.validateConfig({})).toThrow();
  });

  it('validateConfig passes with api_key', () => {
    expect(() => adapter.validateConfig({ api_key: 'sk-ant-test' })).not.toThrow();
  });

  (SKIP ? it.skip : it)('healthCheck returns healthy with valid key', async () => {
    const result = await adapter.healthCheck({ api_key: API_KEY! });
    expect(result.healthy).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
  }, 10000);

  (SKIP ? it.skip : it)('healthCheck returns unhealthy with invalid key', async () => {
    const result = await adapter.healthCheck({ api_key: 'sk-ant-invalid' });
    expect(result.healthy).toBe(false);
  }, 10000);

  (SKIP ? it.skip : it)('sendMessage returns text response', async () => {
    const result = await adapter.sendMessage({
      config: { api_key: API_KEY!, model: 'claude-haiku-4-5-20251001' },
      message: 'Reply with just: OK',
      systemPrompt: 'You are a test assistant. Follow instructions exactly.',
    });
    expect(result.text).toBeTruthy();
    expect(result.model).toContain('claude');
  }, 30000);

  (SKIP ? it.skip : it)('sendMessage with tool_context includes tools in request', async () => {
    const tokens: string[] = [];
    const result = await adapter.sendMessage({
      config: { api_key: API_KEY!, model: 'claude-haiku-4-5-20251001' },
      message: 'What tools do you have available? List their names.',
      tool_context: [
        {
          name: 'web_search',
          description: 'Search the web for information',
          endpoint: 'https://api.example.com/search',
          method: 'GET',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search query' } },
            required: ['query'],
          },
        },
      ],
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBeTruthy();
    // Token streaming should have fired
    expect(tokens.length).toBeGreaterThan(0);
  }, 30000);
});
