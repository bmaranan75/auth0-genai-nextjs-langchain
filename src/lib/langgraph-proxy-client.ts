/**
 * LangGraph Proxy Client
 * 
 * Lightweight client for communicating with LangGraph server from Next.js.
 * This client handles thread management and streaming requests to the supervisor agent.
 */

export interface ThreadCreateResponse {
  thread_id?: string;
  id?: string;
  threadId?: string;
}

export interface StreamRunRequest {
  assistant_id: string;
  input: {
    messages: Array<{ role: string; content: string }>;
    userId: string;
    conversationId: string;
  };
  config?: {
    configurable?: {
      user_id?: string;
      _credentials?: {
        user?: any;
      };
      [key: string]: any;
    };
  };
  stream_mode?: 'values' | 'updates' | 'debug' | Array<'values' | 'updates' | 'debug'>;
}

export class LangGraphProxyClient {
  private baseUrl: string;
  private threadCache: Map<string, string> = new Map();

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.LANGGRAPH_SERVER_URL || 'http://127.0.0.1:8123').replace(/\/$/, '');
  }

  /**
   * Create a new thread in LangGraph server
   */
  async createThread(metadata: Record<string, any>): Promise<string> {
    const cacheKey = metadata.conversationId || metadata.userId;
    
    // Check if we already have a thread for this conversation
    if (cacheKey && this.threadCache.has(cacheKey)) {
      return this.threadCache.get(cacheKey)!;
    }

    try {
      const response = await fetch(`${this.baseUrl}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create thread: ${response.status} ${response.statusText}`);
      }

      const data: ThreadCreateResponse = await response.json();
      const threadId = data.thread_id || data.id || data.threadId;

      if (!threadId) {
        throw new Error('LangGraph server did not return a thread ID');
      }

      // Cache the thread ID
      if (cacheKey) {
        this.threadCache.set(cacheKey, threadId);
      }

      return threadId;
    } catch (error) {
      console.error('[LangGraphProxyClient] Error creating thread:', error);
      throw error;
    }
  }

  /**
   * Stream a run from the supervisor agent
   * Returns a Response object that can be piped directly to the client
   */
  async streamRun(
    threadId: string,
    assistantId: string,
    input: any,
    config?: any
  ): Promise<Response> {
    const requestBody: StreamRunRequest = {
      assistant_id: assistantId,
      input,
      config,
      stream_mode: ['values', 'updates'], // Use both modes to capture all agent outputs
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/threads/${threadId}/runs/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`LangGraph stream error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error('[LangGraphProxyClient] Error streaming run:', error);
      throw error;
    }
  }

  /**
   * Get the current state of a thread
   */
  async getThreadState(threadId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/threads/${threadId}/state`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to get thread state: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[LangGraphProxyClient] Error getting thread state:', error);
      throw error;
    }
  }

  /**
   * Clear the thread cache (useful for testing)
   */
  clearCache(): void {
    this.threadCache.clear();
  }

  /**
   * Health check - verify LangGraph server is accessible
   */
  async healthCheck(): Promise<{ status: string; assistants?: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/ok`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        // Also check if supervisor is registered
        const assistantsResponse = await fetch(`${this.baseUrl}/assistants`, {
          headers: { 'Accept': 'application/json' },
        });

        if (assistantsResponse.ok) {
          const assistants = await assistantsResponse.json();
          const assistantIds = assistants.map((a: any) => a.assistant_id || a.graph_id);
          
          return {
            status: 'healthy',
            assistants: assistantIds,
          };
        }

        return { status: 'healthy' };
      }

      return { status: 'unhealthy' };
    } catch (error) {
      console.error('[LangGraphProxyClient] Health check failed:', error);
      return { status: 'error' };
    }
  }
}

// Export a singleton instance
export const langgraphClient = new LangGraphProxyClient();
