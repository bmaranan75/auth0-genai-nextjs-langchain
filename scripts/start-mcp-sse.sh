#!/bin/bash

# Quick Start Script for MCP Server with SSE Transport
# This script helps you get started quickly with the production-ready MCP implementation

set -e

echo "🚀 MCP Server Quick Start (SSE Transport)"
echo "=========================================="
echo ""

# Check if Next.js is running
echo "1️⃣  Checking if Next.js is running on port 3000..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Next.js is running"
else
    echo "❌ Next.js is not running"
    echo "   Please start it with: npm run dev"
    exit 1
fi
echo ""

# Check environment variables
echo "2️⃣  Checking environment variables..."
if [ -f .env.local ]; then
    if grep -q "MCP_SERVER_PORT" .env.local; then
        echo "✅ MCP_SERVER_PORT is configured"
    else
        echo "⚠️  MCP_SERVER_PORT not found, using default: 3001"
    fi
    
    if grep -q "MCP_API_KEY" .env.local; then
        echo "✅ MCP_API_KEY is configured"
    else
        echo "❌ MCP_API_KEY is required"
        echo "   Please add it to .env.local"
        exit 1
    fi
else
    echo "❌ .env.local not found"
    exit 1
fi
echo ""

# Check if port 3001 is available
echo "3️⃣  Checking if port 3001 is available..."
if lsof -i :3001 > /dev/null 2>&1; then
    echo "⚠️  Port 3001 is already in use"
    echo "   Kill the process or change MCP_SERVER_PORT in .env.local"
    lsof -i :3001
    exit 1
else
    echo "✅ Port 3001 is available"
fi
echo ""

# Start MCP server
echo "4️⃣  Starting MCP Server with SSE transport..."
echo ""
echo "📝 Server will be available at:"
echo "   - Health Check: http://localhost:3001/health"
echo "   - SSE Endpoint: http://localhost:3001/sse"
echo ""
echo "📝 To test the server after it starts:"
echo "   - Run: node scripts/test-mcp-sse.js"
echo "   - Or open: http://localhost:3000/mcp-test.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run mcp:dev
