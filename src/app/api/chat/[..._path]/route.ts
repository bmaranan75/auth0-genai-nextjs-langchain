import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // For now, return a simple response indicating LangChain is working
    // but we need the LangGraph server for full functionality
    return NextResponse.json({
      message: "LangChain implementation is ready! Start the LangGraph server with 'npm run dev:langgraph' for full functionality.",
      received: body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "LangChain API Ready",
    message: "Start LangGraph server for full functionality"
  });
}
