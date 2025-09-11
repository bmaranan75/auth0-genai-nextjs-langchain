import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { agent, createAgent } from '@/lib/agent';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState, resetAuthorizationState } from '@/lib/auth0-ai-langchain';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        message: "Hello! I'm your shopping assistant. How can I help you today?"
      });
    }

    // Get the last message from the user
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({
        message: "I didn't receive a message. Please try again."
      });
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
      
      // Create a new agent instance with the userId
      const agent = createAgent(userId ?? '');

      // Use the agent with proper Auth0 context
      const result = await agent.invoke(
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
      );
      
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
      
      return NextResponse.json(response);
      
    } catch (agentError) {
      console.error('Agent error:', agentError);
      
      // Check if it's a recursion error
      if (agentError && typeof agentError === 'object' && 'lc_error_code' in agentError) {
        if (agentError.lc_error_code === 'GRAPH_RECURSION_LIMIT') {
          console.error('GraphRecursionError detected. The agent may be stuck in a loop.');
          return NextResponse.json({
            message: "I apologize, but I encountered an issue processing your request. Please try rephrasing your question or ask for something more specific.",
            error: "Request too complex - please simplify"
          });
        }
      }
      
      return NextResponse.json({
        message: "I'm your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?"
      });
    }
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "LangChain Agent Ready",
    message: "Direct LangChain integration active"
  });
}
