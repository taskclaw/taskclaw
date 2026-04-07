import { AnthropicAdapter } from './anthropic.adapter';

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeAll(() => {
    adapter = new AnthropicAdapter();
  });

  it('should have slug = anthropic', () => {
    expect(adapter.slug).toBe('anthropic');
  });

  it('should validate config - missing api_key', () => {
    expect(() => adapter.validateConfig({})).toThrow();
  });

  it('should support tool execution', () => {
    expect(adapter.supportsToolExecution()).toBe(true);
  });

  it('should support native skill injection', () => {
    expect(adapter.supportsNativeSkillInjection()).toBe(true);
  });

  // Skip API tests since no ANTHROPIC_API_KEY
  it.skip('should pass health check (requires ANTHROPIC_API_KEY)', async () => {
    const result = await adapter.healthCheck({ api_key: process.env.ANTHROPIC_API_KEY });
    expect(result.healthy).toBe(true);
  });
});
