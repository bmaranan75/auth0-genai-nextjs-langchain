import * as supervisor from '../src/lib/agents/supervisor';

describe('extractProductInfo', () => {
  test('returns parsed product when LLM returns valid JSON', async () => {
    // Mock llm.invoke to return a message-like object
    const fakeResponse = { content: JSON.stringify({ product: 'bananas', quantity: 2 }) };
    // @ts-ignore - inject mock
    supervisor.llm = { invoke: jest.fn().mockResolvedValue(fakeResponse) };

    const res = await supervisor.extractProductInfo('I want 2 bananas');
    expect(res).not.toBeNull();
    expect(res!.product).toBe('bananas');
    expect(res!.quantity).toBe(2);
  });

  test('returns null when LLM returns non-json', async () => {
    const fakeResponse = { content: 'Sorry I cannot help' };
    // @ts-ignore - inject mock
    supervisor.llm = { invoke: jest.fn().mockResolvedValue(fakeResponse) };

    const res = await supervisor.extractProductInfo('I want something');
    expect(res).toBeNull();
  });
});
