import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { createAgent } from '@/lib/multi-agent';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState, resetAuthorizationState } from '@/lib/auth0-ai-langchain';
import { InMemoryCache } from "@langchain/core/caches";
import { LangChainTracer } from "langchain/callbacks";

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds timeout

// Initialize tracing
if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
  const tracer = new LangChainTracer({
    projectName: "Auth0 GenAI Next.js LangChain",
  });
}

const cache = new InMemoryCache();

export async function POST(req: NextRequest) {
  try {
    // Add CORS headers for better browser compatibility
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    const body = await req.json();
    const { messages, conversationId } = body;
    
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
      
      // Create a new multi-agent instance with the userId and conversationId for each request
      // This uses the supervisor agent to route to specialized agents
      const agent = createAgent(userId ?? '', conversationId);

      // Use the agent with proper Auth0 context and timeout handling  
      const result = await Promise.race([
        agent.invoke({
          messages: [new HumanMessage(lastMessage.content)],
          conversationId
        }, {
          configurable: {
            cache,
          },
        }),
        // Add timeout protection for Vercel
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 55000) // 55s timeout
        )
      ]) as any; // Type assertion needed for Promise.race with different return types
      
      console.log("[chat-api] Agent result:", JSON.stringify(result, null, 2));
      
      // Extract the response from the agent. Support nested AnnotatedMessage wrappers and plain AIMessage.
      const rawResponse = result.messages && result.messages.length > 0 ? result.messages[result.messages.length - 1] : null;
      console.log("[chat-api] Raw response message:", JSON.stringify(rawResponse, null, 2));
      console.log("[chat-api] Number of result messages:", result.messages?.length || 0);

      // Helper to recursively unwrap objects with a `.message` property until we reach the underlying message
      function unwrapMessage(obj: any): any {
        let cur = obj;
        const seen = new Set<any>();
        while (cur && typeof cur === 'object' && 'message' in cur && !seen.has(cur)) {
          seen.add(cur);
          cur = cur.message;
        }
        return cur;
      }

      const unwrapped = rawResponse ? unwrapMessage(rawResponse) : null;
      // Try common fields for content
      let responseContent: string | undefined = undefined;
      if (unwrapped) {
        if (typeof unwrapped === 'string') responseContent = unwrapped;
        else if (unwrapped.content) responseContent = typeof unwrapped.content === 'string' ? unwrapped.content : String(unwrapped.content);
        else if (unwrapped.text) responseContent = typeof unwrapped.text === 'string' ? unwrapped.text : String(unwrapped.text);
      }

      // Enhanced tool call extraction specifically for the planner's direct_response and generate_plan tools
      function extractFromToolCalls(obj: any): string | undefined {
        try {
          const calls = obj?.additional_kwargs?.tool_calls || obj?.tool_calls || (obj?.message && (obj.message.additional_kwargs?.tool_calls || obj.message.tool_calls));
          if (!calls || !Array.isArray(calls) || calls.length === 0) return undefined;
          
          const first = calls[0];
          console.log(`[chat-api] Processing tool call: ${first.name}`, first.args || first.arguments);
          
          // Handle different tool call shapes
          const args = first.args || first.arguments || first.function?.arguments || (first.function && first.function.arguments);
          if (!args) return undefined;

          // Handle stringified JSON arguments
          let parsedArgs = args;
          if (typeof args === 'string') {
            try {
              parsedArgs = JSON.parse(args);
            } catch (_e) {
              // If it's not JSON, treat as direct string
              return args;
            }
          }

          // Extract based on tool name for better accuracy
          if (first.name === 'direct_response') {
            return parsedArgs.answer || parsedArgs.content || parsedArgs.text;
          } else if (first.name === 'generate_plan') {
            // For generate_plan, return a user-friendly message since the actual planning happens in supervisor
            const steps = parsedArgs.steps || [];
            return `Let me help you with that. I'll need to look up some information to give you the best answer.`;
          }

          // Fallback extraction for other tool types
          if (typeof parsedArgs === 'object') {
            if (typeof parsedArgs.answer === 'string') return parsedArgs.answer;
            if (typeof parsedArgs.content === 'string') return parsedArgs.content;
            if (typeof parsedArgs.text === 'string') return parsedArgs.text;
            // Last resort - stringify
            return JSON.stringify(parsedArgs);
          }
          
        } catch (err) {
          console.warn('[chat-api] Error extracting tool_calls:', err);
        }
        return undefined;
      }

      // First, try to get content directly from the message if it exists
      if (!responseContent && unwrapped && unwrapped.content) {
        responseContent = typeof unwrapped.content === 'string' ? unwrapped.content : String(unwrapped.content);
        console.log("[chat-api] Found direct content:", responseContent);
      }

      // Try extraction from tool calls if no direct content
      if (!responseContent && unwrapped) {
        responseContent = extractFromToolCalls(unwrapped);
      }

      // Then try extraction from the top-level result
      if (!responseContent && result) {
        responseContent = extractFromToolCalls(result) || extractFromToolCalls(result.result) || extractFromToolCalls(result.content);
      }

      // Fallback: sometimes agent returns top-level `content` or `result.content`
      if (!responseContent && result && (result.content || result.result?.content)) {
        const fallback = result.content || result.result?.content;
        responseContent = typeof fallback === 'string' ? fallback : String(fallback);
      }

      console.log("[chat-api] Raw agent response:", JSON.stringify(rawResponse || result, null, 2));
      console.log("[chat-api] Unwrapped response content:", responseContent);
      
      // Get authorization state after processing
      const authState = getAuthorizationState();
      
      const response: any = {
        message: responseContent || "I'm sorry, I couldn't process that request."
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
