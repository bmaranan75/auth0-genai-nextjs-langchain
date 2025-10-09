import { describe, it, expect, vi, beforeEach } from 'vitest';
import LangGraphClient, { conversationThreadMap, conversationThreadTimestamps, parseSSEFromString } from '../src/lib/agents/langgraphClient';

describe('LangGraphClient helpers', () => {
  beforeEach(() => {
    conversationThreadMap.clear();
    conversationThreadTimestamps.clear();
    vi.restoreAllMocks();
  });

  it('parses SSE blocks including JSON and text', () => {
    const sse = "data: {\"messages\": [{\"role\": \"assistant\", \"content\": \"Hello\"}]}\n\n" +
                "data: some raw text chunk\n\n" +
                "data: [DONE]\n\n";

  const events = parseSSEFromString(sse);
  expect(events.length).toBe(3);
  expect((events[0] as any).json.messages[0].content).toBe('Hello');
  expect((events[1] as any).text).toBe('some raw text chunk');
  expect(events[2].done).toBe(true);
  });

  it('ensureThread creates a thread via fetch and stores mapping', async () => {
    const fakeThreadId = 'thread-123';
    const fetchMock = vi.spyOn(globalThis as any, 'fetch').mockImplementation(async (...args: any[]) => {
      const url = args[0] as string;
      const opts = args[1];
      if (url.endsWith('/threads') && opts?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ thread_id: fakeThreadId })
        } as any;
      }
      throw new Error('unexpected call');
    });

    const client = new LangGraphClient('http://localhost:2024');
    const tid = await client.ensureThread('conv-test', 'user-1', 'agent-x');
    expect(tid).toBe(fakeThreadId);
    expect(conversationThreadMap.get('conv-test')).toBe(fakeThreadId);
    expect(conversationThreadTimestamps.has('conv-test')).toBe(true);

    fetchMock.mockRestore();
  });
});
