import { NextRequest, NextResponse } from 'next/server';
import { cartAndCheckoutGraph } from '@/lib/agents/cart-and-checkout-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for cart and checkout agent
 * This is separate from existing /api/chat endpoints
 * 
 * URL: POST /api/mcp/agents/cart
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication
    if (!verifyMCPAuth(req)) {
      throw new MCPAuthError();
    }

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Cart] Request:', { action, args });

    // Generate a thread ID if not provided
    const configThreadId = threadId || `mcp-cart-${Date.now()}`;

    // Invoke existing cart agent (no changes to agent)
    const result = await cartAndCheckoutGraph.invoke(
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

    console.log('[MCP Cart] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Cart] Error:', error);

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
