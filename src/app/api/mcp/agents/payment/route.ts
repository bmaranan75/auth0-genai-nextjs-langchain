import { NextRequest, NextResponse } from 'next/server';
import { paymentGraph } from '@/lib/agents/payment-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for payment agent
 * This is separate from existing /api/chat endpoints
 * 
 * URL: POST /api/mcp/agents/payment
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication
    if (!verifyMCPAuth(req)) {
      throw new MCPAuthError();
    }

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Payment] Request:', { action, args });

    // Generate a thread ID if not provided
    const configThreadId = threadId || `mcp-payment-${Date.now()}`;

    // Invoke existing payment agent (no changes to agent)
    const result = await paymentGraph.invoke(
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

    console.log('[MCP Payment] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Payment] Error:', error);

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
