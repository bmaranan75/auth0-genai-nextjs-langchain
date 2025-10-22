import { NextRequest, NextResponse } from 'next/server';
import { catalogGraph } from '@/lib/agents/catalog-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for catalog agent
 * This is separate from existing /api/chat endpoints
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication
    if (!verifyMCPAuth(req)) {
      throw new MCPAuthError();
    }

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Catalog] Request:', { action, args });

    // Generate a thread ID if not provided
    const configThreadId = threadId || `mcp-catalog-${Date.now()}`;

    // Invoke existing catalog agent (no changes to agent)
    const result = await catalogGraph.invoke(
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

    console.log('[MCP Catalog] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Catalog] Error:', error);

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