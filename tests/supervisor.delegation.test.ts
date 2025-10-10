import { describe, it, expect } from 'vitest';
import { routePlanner } from '../src/lib/agents/supervisor';

// Minimal mock of SupervisorState.State shape for testing
function makeState(messages: any[], delegationDepth?: number) {
  return {
    messages,
    delegationDepth,
  } as any;
}

describe('routePlanner delegation depth guard', () => {
  it('should allow delegation when depth is below max', () => {
    const plannerDelegationMsg = {
      delegation: {
        targetAgent: 'catalog',
        confidence: 0.9,
        task: 'find apples',
        reasoning: 'looks like a product search'
      },
      message: { tool_calls: [] }
    };

    const state = makeState([plannerDelegationMsg], 1);
    const res = routePlanner(state as any);
    expect(res).toBe('catalog');
    // ensure the state increment happened
    expect(state.delegationDepth).toBe(2);
  });

  it('should prevent delegation when depth is at or above max', () => {
    const plannerDelegationMsg = {
      delegation: {
        targetAgent: 'catalog',
        confidence: 0.9,
        task: 'find apples',
        reasoning: 'looks like a product search'
      },
      message: { tool_calls: [] }
    };

    const state = makeState([plannerDelegationMsg], 3);
    const res = routePlanner(state as any);
    // At max depth, supervisor should be chosen to avoid further delegation
    expect(res).toBe('supervisor');
    // delegationDepth should remain unchanged or be a number
    expect(typeof state.delegationDepth).toBe('number');
  });
});
