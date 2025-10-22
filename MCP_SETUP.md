# MCP Server Setup Guide

## Overview

This project exposes LangGraph agents via Model Context Protocol (MCP), allowing Claude Desktop and other MCP clients to interact with your Safeway shopping assistant agents.

## Architecture

```
┌─────────────────────┐
│   Claude Desktop    │  (MCP Client)
└──────────┬──────────┘
           │ stdio/MCP Protocol
           ▼
┌─────────────────────┐
│    MCP Server       │  (src/mcp/server.ts)
│  Port: stdio        │
└──────────┬──────────┘
           │ HTTP + MCP_API_KEY
           ▼
┌─────────────────────┐
│   Next.js API       │  (src/app/api/mcp/agents/*)
│  Port: 3000         │
└──────────┬──────────┘
           │ Direct invocation
           ▼
┌─────────────────────┐
│  LangGraph Agents   │  (src/lib/agents/*)
│  - Supervisor       │
│  - Catalog          │
│  - Cart & Checkout  │
│  - Payment          │
│  - Deals            │
└─────────────────────┘
```

## Files Created

### MCP Server (Phase 3)
- `src/mcp/server.ts` - Main MCP server entry point
- `src/mcp/client.ts` - HTTP client for calling Next.js API
- `src/mcp/tools.ts` - MCP tool definitions
- `src/mcp/tsconfig.json` - TypeScript configuration

### API Routes (Phase 2)
- `src/app/api/mcp/agents/catalog/route.ts` - Catalog agent endpoint
- `src/app/api/mcp/agents/cart/route.ts` - Cart agent endpoint
- `src/app/api/mcp/agents/payment/route.ts` - Payment agent endpoint
- `src/app/api/mcp/agents/deals/route.ts` - Deals agent endpoint
- `src/lib/mcp/auth.ts` - MCP authentication helper

### Configuration
- `src/middleware.ts` - Updated to allow MCP routes
- `langgraph.json` - Updated with MCP configuration
- `.env.local` - Contains NEXTJS_URL and MCP_API_KEY

## Available Tools

The MCP server exposes these tools to Claude Desktop:

1. **search_products** - Search the Safeway catalog
2. **add_to_cart** - Add products to cart
3. **view_cart** - View current cart contents
4. **checkout** - Complete checkout with CIBA authorization
5. **add_payment_method** - Add payment methods
6. **get_deals** - Get current deals and promotions

## Running the MCP Server

### Step 1: Start Next.js (Terminal 1)
```bash
npm run dev
```

Next.js will run on http://localhost:3000

### Step 2: Build MCP Server (One-time)
```bash
npm run mcp:build
```

This compiles TypeScript to JavaScript in `dist/mcp/`

### Step 3: Start MCP Server (Terminal 2)
```bash
npm run mcp:dev
```

Or for production:
```bash
npm run mcp:start
```

### Verification
You should see:
```
[MCP Server] Starting Safeway Shopping Assistant MCP Server...
[MCP Server] Next.js URL: http://localhost:3000
[MCP Server] MCP_API_KEY: 2cf6ea0bd7... (truncated)
[MCP Server] Running on stdio transport
[MCP Server] Ready to receive MCP requests from Claude Desktop
[MCP Server] Available tools: search_products, add_to_cart, view_cart, checkout, add_payment_method, get_deals
```

## Configuring Claude Desktop

### Step 1: Get Your MCP API Key
```bash
grep MCP_API_KEY .env.local
```

Copy the value after `MCP_API_KEY=`

### Step 2: Update Claude Desktop Config

**macOS:**
```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Step 3: Add Configuration

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "command": "node",
      "args": [
        "/Users/bmara00/GithubPersonal/auth0-genai-nextjs-langchain/dist/mcp/server.js"
      ],
      "env": {
        "NEXTJS_URL": "http://localhost:3000",
        "MCP_API_KEY": "your-actual-key-here"
      }
    }
  }
}
```

**Important:** Replace:
- The path with your actual project path
- `your-actual-key-here` with your actual MCP_API_KEY

### Step 4: Restart Claude Desktop

After saving the config, completely quit and restart Claude Desktop.

### Step 5: Verify in Claude Desktop

In Claude Desktop, you should see a 🔌 icon or "MCP" indicator showing the server is connected.

Try asking:
```
"Search for milk in the catalog"
"Add organic apples to my cart"
"Show me current deals"
```

## Testing Without Claude Desktop

### Test API Routes Directly
```bash
./scripts/test-mcp-routes.sh
```

This tests all 4 agent endpoints and verifies authentication.

### Test Individual Endpoints
```bash
# Test catalog search
curl -X POST http://localhost:3000/api/mcp/agents/catalog \
  -H "Content-Type: application/json" \
  -H "X-MCP-API-Key: YOUR_KEY" \
  -d '{"action":"search","query":"milk","limit":3}'

# Test cart view
curl -X POST http://localhost:3000/api/mcp/agents/cart \
  -H "Content-Type: application/json" \
  -H "X-MCP-API-Key: YOUR_KEY" \
  -d '{"action":"view"}'
```

## Troubleshooting

### MCP Server Not Starting

**Error:** `MCP_API_KEY environment variable is required`
- Ensure `.env.local` has `MCP_API_KEY` set
- Restart the terminal to reload environment

**Error:** `Cannot find module '@modelcontextprotocol/sdk'`
- Run: `npm install`

### API Routes Return 404

**Problem:** Routes not found
- Restart Next.js: `npm run dev`
- Check `src/middleware.ts` allows `/api/mcp` routes

### API Routes Return 401

**Problem:** Unauthorized
- Check MCP_API_KEY matches in `.env.local` and Claude config
- Ensure you're sending `X-MCP-API-Key` header

### Claude Desktop Not Connecting

1. Check MCP server is running (`npm run mcp:dev`)
2. Check Next.js is running (`npm run dev`)
3. Verify `claude_desktop_config.json` path is correct
4. Check logs in Claude Desktop (View → Developer → Toggle Developer Tools)
5. Restart Claude Desktop completely

### MCP Server Crashes

**Check logs for:**
- HTTP connection errors → Ensure Next.js is running
- Authentication errors → Check MCP_API_KEY
- Timeout errors → Increase timeout in `client.ts`

## Development Workflow

### Making Changes to Agents

1. Modify your LangGraph agents in `src/lib/agents/`
2. Changes are automatically picked up (no rebuild needed)
3. Both Next.js app and MCP server will use updated agents

### Making Changes to MCP Server

1. Edit files in `src/mcp/`
2. Rebuild: `npm run mcp:build`
3. Restart MCP server: `npm run mcp:start`

### Adding New Tools

1. Add tool definition to `src/mcp/tools.ts`
2. Add case to switch statement in `src/mcp/server.ts`
3. Create/update API route in `src/app/api/mcp/agents/`
4. Rebuild and restart MCP server

## Security Notes

- **MCP_API_KEY** is for service-to-service auth (MCP server → Next.js)
- **Auth0** is for user authentication (unchanged)
- Never commit `.env.local` to git
- Use different keys for dev/staging/prod
- Rotate keys periodically

## Environment Variables

Required in `.env.local`:

```bash
# MCP Configuration
NEXTJS_URL=http://localhost:3000
MCP_API_KEY=your-secure-random-key-here

# Existing Auth0, Database, etc. (unchanged)
AUTH0_SECRET=...
DATABASE_URL=...
```

## Scripts Reference

```bash
# Development
npm run dev              # Start Next.js
npm run mcp:dev          # Start MCP server (watch mode)

# Build
npm run build            # Build Next.js
npm run mcp:build        # Build MCP server

# Production
npm start                # Start Next.js production
npm run mcp:start        # Start MCP server production

# Testing
./scripts/test-mcp-routes.sh      # Test API routes
./scripts/verify-mcp-setup.sh     # Verify setup
```

## Architecture Benefits

1. ✅ **Zero changes** to existing LangGraph agents
2. ✅ **Zero changes** to existing Next.js app functionality
3. ✅ **HTTP-based** - can deploy separately if needed
4. ✅ **Secure** - MCP API key authentication
5. ✅ **Flexible** - works with any MCP client
6. ✅ **Maintainable** - clear separation of concerns

## Support

For issues or questions:
1. Check logs in both terminals (Next.js + MCP server)
2. Run verification script: `./scripts/verify-mcp-setup.sh`
3. Test API routes: `./scripts/test-mcp-routes.sh`
4. Check this README's troubleshooting section
