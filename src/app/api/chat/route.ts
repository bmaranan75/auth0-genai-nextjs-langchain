/**
 * Chat API Route - Thin Proxy to LangGraph Server
 * 
 * This route acts as a thin proxy between the Next.js UI and the LangGraph server.
 * All agent logic (including supervisor and planner) runs on the LangGraph server.
 * 
 * Responsibilities:
 * - Authenticate users via Auth0
 * - Create/retrieve conversation threads
 * - Forward requests to LangGraph server's supervisor agent
 * - Transform SSE events from LangGraph format to UI format
 * - Stream responses back to the client
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';
import { langgraphClient } from '@/lib/langgraph-proxy-client';

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds timeout

/**
 * Transform LangGraph SSE events to UI-expected format
 * 
 * LangGraph sends:
 *   event: values
 *   data: { "messages": [...] }
 * 
 * UI expects:
 *   data: {"type": "message", "content": "..."}
 */
function transformLangGraphStream(originalStream: ReadableStream): ReadableStream {
  const reader = originalStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      let buffer = '';
      let currentEvent = '';
      let dataLines: string[] = [];
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send final done event
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('event:')) {
              // Process previous event if any
              if (currentEvent && dataLines.length > 0) {
                processEvent(currentEvent, dataLines, controller, encoder);
              }
              // Start new event
              currentEvent = line.slice(7).trim();
              dataLines = [];
              
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(6).trim());
              
            } else if (line.trim() === '') {
              // Empty line marks end of event
              if (currentEvent && dataLines.length > 0) {
                processEvent(currentEvent, dataLines, controller, encoder);
                currentEvent = '';
                dataLines = [];
              }
            }
          }
        }
      } catch (error) {
        console.error('[transformLangGraphStream] Error:', error);
        controller.error(error);
      }
    },
    
    cancel() {
      reader.cancel();
    }
  });
}

function processEvent(
  eventType: string,
  dataLines: string[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  try {
    // Join multi-line data and parse
    const dataStr = dataLines.join('');
    const data = JSON.parse(dataStr);
    
    if (eventType === 'values') {
      // Extract the last message from the agent
      const messages = data.messages || [];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        
        console.log('[processEvent] Last message agent:', lastMessage.agent, 'type:', lastMessage.message?.type);
        
        // Check if it's an AI message (agent response)
        if (lastMessage.message?.type === 'ai' || lastMessage.role === 'assistant') {
          const content = lastMessage.message?.content || lastMessage.content || '';
          
          if (content) {
            // Check if this is a progress update (ephemeral message)
            if (lastMessage.progress && lastMessage.progress.isProgressUpdate) {
              console.log('[processEvent] Sending progress to UI:', content);
              
              // Send as progress event to UI
              const uiEvent = {
                type: 'progress',
                content: content
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
            } 
            // Skip internal planner messages (JSON responses)
            else if (lastMessage.agent === 'planner') {
              console.log('[processEvent] Skipping internal planner message');
            }
            // This is a final response message from an actual agent
            else {
              console.log('[processEvent] Sending message to UI from', lastMessage.agent, ':', content.substring(0, 100));
              
              // Send as message event to UI
              const uiEvent = {
                type: 'message',
                content: content
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
            }
          }
        }
      }
      
    } else if (eventType === 'metadata') {
      // Forward metadata events
      const uiEvent = {
        type: 'metadata',
        payload: data
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
      
    } else if (eventType === 'error') {
      // Forward error events
      const uiEvent = {
        type: 'error',
        content: data.message || 'An error occurred'
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(uiEvent)}\n\n`));
    }
    
  } catch (error) {
    console.error('[processEvent] Error processing event:', error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, conversationId } = body;
    
    // Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        message: "Hello! I'm your shopping assistant. How can I help you today?"
      });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({
        message: "I didn't receive a message. Please try again."
      });
    }

    // Step 1: Authenticate user via Auth0
    const user = await getUser();
    const userId = user?.sub || 'anonymous';
    
    console.log("[chat-proxy] Processing request for user:", userId);
    console.log("[chat-proxy] Message:", lastMessage.content);

    // Step 2: Create or get conversation thread
    const effectiveConvId = conversationId || `conv-${userId}-${Date.now()}`;
    
    let threadId: string;
    try {
      threadId = await langgraphClient.createThread({
        conversationId: effectiveConvId,
        userId: userId,
        createdAt: new Date().toISOString(),
      });
      console.log("[chat-proxy] Thread ID:", threadId);
    } catch (error) {
      console.error("[chat-proxy] Failed to create thread:", error);
      return NextResponse.json(
        { 
          message: "I'm having trouble connecting to the service. Please try again in a moment.",
          error: "Failed to create conversation thread"
        },
        { status: 503 }
      );
    }

    // Step 3: Stream from supervisor agent on LangGraph server
    try {
      const streamResponse = await langgraphClient.streamRun(
        threadId,
        'supervisor', // Call supervisor agent as entry point
        {
          messages: [{ role: 'human', content: lastMessage.content }],
          userId: userId,
          conversationId: effectiveConvId,
        },
        {
          configurable: {
            user_id: userId,
            _credentials: {
              user: user, // Pass full Auth0 user object for CIBA
            },
          },
        }
      );

      console.log("[chat-proxy] Streaming response from LangGraph server...");
      console.log("[chat-proxy] Response status:", streamResponse.status);

      // Check if the response is actually a stream
      if (!streamResponse.body) {
        console.error("[chat-proxy] No response body from LangGraph server!");
        return NextResponse.json(
          { message: "Failed to get response from agent server" },
          { status: 502 }
        );
      }

      // Step 4: Transform LangGraph SSE events to UI-expected format
      const transformedStream = transformLangGraphStream(streamResponse.body);

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
      });

    } catch (streamError) {
      console.error('[chat-proxy] Stream error:', streamError);
      
      // Return error as JSON
      return NextResponse.json(
        {
          message: "I apologize, but I encountered an error processing your request. Please try again.",
          error: streamError instanceof Error ? streamError.message : "Unknown error"
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('[chat-proxy] API error:', error);
    return NextResponse.json(
      { 
        message: "I'm your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?",
        error: 'Failed to process request' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Chat Proxy Ready",
    message: "Proxying to LangGraph server",
    mode: "thin-proxy",
    serverUrl: process.env.LANGGRAPH_SERVER_URL || 'http://127.0.0.1:8123',
  });
}
