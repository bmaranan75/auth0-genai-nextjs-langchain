#!/bin/bash

echo "================================================"
echo "🔍 MCP Inspector - Interactive Testing Tool"
echo "================================================"
echo ""

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found"
    echo "Run: export PATH=\"/opt/homebrew/bin:\$PATH\""
    exit 1
fi

if [ ! -f ".env.local" ]; then
    echo "❌ Error: .env.local not found"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env.local | xargs)

echo "✅ Prerequisites checked"
echo ""
echo "📋 Starting MCP Inspector..."
echo ""
echo "This will open a web interface where you can:"
echo "  • View all available MCP tools"
echo "  • Test each tool interactively"
echo "  • See request/response in real-time"
echo "  • Debug MCP server behavior"
echo ""
echo "The inspector will start on http://localhost:6274"
echo ""
echo "Press Ctrl+C to stop"
echo ""
sleep 2

# Start MCP Inspector pointing to your MCP server
npx @modelcontextprotocol/inspector node dist/mcp/server.js
