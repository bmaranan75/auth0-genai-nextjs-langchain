#!/bin/bash

echo "================================================"
echo "🚀 MCP Server Quick Start"
echo "================================================"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
  echo "❌ Error: .env.local not found"
  exit 1
fi

# Check if MCP_API_KEY is set
if ! grep -q "MCP_API_KEY" .env.local; then
  echo "❌ Error: MCP_API_KEY not found in .env.local"
  echo ""
  echo "Please add to .env.local:"
  echo "  MCP_API_KEY=$(openssl rand -hex 32)"
  exit 1
fi

# Check if Next.js is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "⚠️  Warning: Next.js doesn't appear to be running"
  echo ""
  echo "Please start Next.js in another terminal:"
  echo "  npm run dev"
  echo ""
  read -p "Press Enter when Next.js is running..."
fi

echo "✅ Prerequisites check passed"
echo ""
echo "Building MCP server..."
npm run mcp:build

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Build successful!"
  echo ""
  echo "================================================"
  echo "Starting MCP Server..."
  echo "================================================"
  echo ""
  echo "The MCP server will now start. You should see:"
  echo "  [MCP Server] Starting Safeway Shopping Assistant..."
  echo "  [MCP Server] Ready to receive MCP requests"
  echo ""
  echo "To configure Claude Desktop:"
  echo "  1. Copy your MCP_API_KEY from .env.local"
  echo "  2. Edit ~/Library/Application Support/Claude/claude_desktop_config.json"
  echo "  3. Add the server configuration (see MCP_SETUP.md)"
  echo "  4. Restart Claude Desktop"
  echo ""
  echo "Press Ctrl+C to stop the server"
  echo ""
  sleep 2
  
  npm run mcp:start
else
  echo ""
  echo "❌ Build failed. Please check the errors above."
  exit 1
fi
