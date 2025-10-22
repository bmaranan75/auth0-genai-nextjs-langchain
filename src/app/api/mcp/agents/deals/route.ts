import { NextRequest, NextResponse } from 'next/server';
import { dealsGraph } from '@/lib/agents/deals-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for deals agent
 * This is separate from existing /api/chat endpoints
 * 
 * URL: POST /api/mcp/agents/deals
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication
    if (!verifyMCPAuth(req)) {
      throw new MCPAuthError();
    }

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Deals] Request:', { action, args });

    // Generate a thread ID if not provided
    const configThreadId = threadId || `mcp-deals-${Date.now()}`;

    // Invoke existing deals agent (no changes to agent)
    const result = await dealsGraph.invoke(
      {
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ action, ...args })
          }
        ]
      },
      {
        configurable: {
          thread_id: configThreadId
        }
      }
    );

    console.log('[MCP Deals] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Deals] Error:', error);

    if (error instanceof MCPAuthError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
