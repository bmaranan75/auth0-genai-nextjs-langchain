# MCP Testing Options (Without Claude Desktop)

You have **4 ways** to test your MCP implementation without installing Claude Desktop:

---

## Option 1: Shell Script Test (Simplest) ✅ READY

Already created and tested!

```bash
# Test all API routes
./scripts/test-mcp-routes.sh
```

**What it does:**
- Tests all 4 agent endpoints
- Verifies authentication works
- Shows response status codes
- ✅ Already working for you!

---

## Option 2: Node.js Test Client (Interactive) ⭐ NEW

Just created! Tests your agents with detailed output.

```bash
# Load environment and run tests
export $(grep -v '^#' .env.local | xargs) && node scripts/test-mcp-client.js
```

**What it does:**
- Calls each agent endpoint
- Shows full request/response
- Extracts AI agent responses
- Pretty formatted output

**Example Output:**
```
🧪 MCP Server Test Client
================================================

📝 Test: Search Products (Catalog Agent)
   Endpoint: /api/mcp/agents/catalog
   ✅ Status: 200 OK
   📤 Response:
   I found a product for you:
   - Milk
     - Price: $4.19
     - Category: Dairy
     - In Stock: Yes
```

---

## Option 3: Web UI Test Page (Visual) 🎨 NEW

Just created a beautiful web interface!

```bash
# 1. Start Next.js
npm run dev

# 2. Open in browser
open http://localhost:3000/mcp-test.html
```

**What it does:**
- Beautiful visual interface
- Click buttons to test each agent
- See responses in real-time
- No command line needed!

**Features:**
- 🔍 Search Products button
- 🛒 View Cart button
- 💳 List Payments button
- 🎁 Get Deals button
- Live response display

---

## Option 4: MCP Inspector (Official Tool) 🔬

The official MCP debugging tool (requires build step):

```bash
# 1. Build MCP server first
npm run mcp:build

# 2. Start Next.js
npm run dev

# 3. Run inspector (in another terminal)
./scripts/test-mcp-inspector.sh
```

**What it does:**
- Opens web UI at http://localhost:6274
- Interactive tool calling
- Real-time debugging
- See MCP protocol details

---

## Quick Start Testing Guide

### Step 1: Ensure Next.js is Running
```bash
npm run dev
```

### Step 2: Choose Your Test Method

**Quickest Test (30 seconds):**
```bash
./scripts/test-mcp-routes.sh
```

**Interactive Test (Detailed):**
```bash
export $(grep -v '^#' .env.local | xargs)
node scripts/test-mcp-client.js
```

**Visual Test (Most Fun):**
```bash
# In browser: http://localhost:3000/mcp-test.html
```

---

## Comparison Table

| Method | Setup Time | Output Style | Best For |
|--------|------------|--------------|----------|
| **Shell Script** | 0 min | Terminal text | Quick verification |
| **Node.js Client** | 0 min | Formatted text | Detailed debugging |
| **Web UI** | 0 min | Visual/Interactive | Demos & exploration |
| **MCP Inspector** | 2 min build | Interactive UI | Deep debugging |

---

## Troubleshooting

### "npm: command not found"
```bash
export PATH="/opt/homebrew/bin:$PATH"
```

### "MCP_API_KEY not set"
```bash
export $(grep -v '^#' .env.local | xargs)
```

### "Connection refused"
Make sure Next.js is running:
```bash
npm run dev
```

---

## What Each Test Proves

✅ **API Routes Work** - Your MCP endpoints are accessible
✅ **Authentication Works** - MCP_API_KEY is validated
✅ **Agents Respond** - LangGraph agents execute correctly
✅ **Tools Execute** - Catalog search, cart operations, etc. work
✅ **HTTP Layer Works** - The HTTP → Agent bridge functions

---

## Ready to Test?

### Recommended Order:

1. **First Run:** `./scripts/test-mcp-routes.sh`
   - Quickest way to verify everything works
   
2. **Second Run:** Open `http://localhost:3000/mcp-test.html`
   - Visual confirmation and exploration
   
3. **Third Run:** `node scripts/test-mcp-client.js`
   - See detailed agent responses

---

## When to Install Claude Desktop?

You can continue testing without Claude Desktop indefinitely! Install it later when:
- You want conversational AI interaction
- You need the full MCP experience
- You want Claude to use your tools naturally

For now, these 4 testing methods are **more than sufficient** to verify your MCP implementation works perfectly! 🎉
