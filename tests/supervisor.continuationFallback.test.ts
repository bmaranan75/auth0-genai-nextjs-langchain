import * as supervisor from '../src/lib/agents/supervisor';

describe('detectContinuationIntent fallback', () => {
  test('fallback to affirmative detection when LLM errors', async () => {
    // Force llm.invoke to throw
    // @ts-ignore
    supervisor.llm = { invoke: jest.fn().mockRejectedValue(new Error('llm error')) };

    const res = await supervisor.detectContinuationIntent('yes', [], 'awaiting_deal_confirmation', { some: 'deal' }, { product: 'bananas', quantity: 1 });
    expect(res.isContinuation).toBe(true);
    expect(res.continuationType).toBe('deal_confirmation');
    expect(res.targetAgent).toBe('cart_and_checkout');
    expect(res.confidence).toBeGreaterThan(0.7);
  });
});
