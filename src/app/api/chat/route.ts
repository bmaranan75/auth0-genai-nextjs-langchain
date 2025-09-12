import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { createAgent } from '@/lib/agent';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState, resetAuthorizationState } from '@/lib/auth0-ai-langchain';

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds timeout

export async function POST(req: NextRequest) {
  try {
    // Add CORS headers for better browser compatibility
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    const body = await req.json();
    const { messages } = body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        message: "Hello! I'm your shopping assistant. How can I help you today?"
      }, { headers });
    }

    // Get the last message from the user
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({
        message: "I didn't receive a message. Please try again."
      }, { headers });
    }

    try {
      let userId = null;
      // Get the authenticated user for Auth0 AI context
      const user = await getUser();
      userId = user?.sub;
      console.log("[chat-api] User context:", user?.sub);
      console.log("[chat-api] User message:", lastMessage.content);
      
      // Reset authorization state before processing
      resetAuthorizationState();
      
      // Create a new agent instance with the userId for each request
      // This is important for serverless functions to avoid state issues
      const agent = createAgent(userId ?? '');

      // Use the agent with proper Auth0 context and timeout handling
      const result = await Promise.race([
        agent.invoke(
          {
            messages: [new HumanMessage(lastMessage.content)]
          },
          {
            configurable: {
              user_id: user?.sub,
              _credentials: {
                user: user
              }
            },
            recursionLimit: 50 // Increase from default 25 to 50
          }
        ),
        // Add timeout protection for Vercel
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 55000) // 55s timeout
        )
      ]) as any; // Type assertion needed for Promise.race with different return types
      
      console.log("[chat-api] Agent result:", JSON.stringify(result, null, 2));
      
      // Extract the response from the agent
      const responseMessage = result.messages[result.messages.length - 1];
      console.log("[chat-api] Response message:", responseMessage.content);
      
      // Get authorization state after processing
      const authState = getAuthorizationState();
      
      const response: any = {
        message: responseMessage.content || "I'm sorry, I couldn't process that request."
      };

      // Include authorization status if there was an authorization request
      if (authState.status !== 'idle') {
        response.authorizationStatus = authState.status;
        if (authState.message) {
          response.authorizationMessage = authState.message;
        }
      }
      
      return NextResponse.json(response, { headers });
      
    } catch (agentError) {
      console.error('Agent error:', agentError);
      
      // Handle timeout specifically
      if (agentError instanceof Error && agentError.message === 'Request timeout') {
        return NextResponse.json({
          message: "I apologize, but your request is taking longer than expected. Please try asking for something more specific or try again later.",
          error: "Request timeout"
        }, { headers });
      }
      
      // Check if it's a recursion error
      if (agentError && typeof agentError === 'object' && 'lc_error_code' in agentError) {
        if (agentError.lc_error_code === 'GRAPH_RECURSION_LIMIT') {
          console.error('GraphRecursionError detected. The agent may be stuck in a loop.');
          return NextResponse.json({
            message: "I apologize, but I encountered an issue processing your request. Please try rephrasing your question or ask for something more specific.",
            error: "Request too complex - please simplify"
          }, { headers });
        }
      }
      
      return NextResponse.json({
        message: "I'm your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?"
      }, { headers });
    }
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "LangChain Agent Ready",
    message: "Direct LangChain integration active - no LangGraph server needed",
    runtime: "serverless",
    deployment: "vercel-compatible"
  });
}
