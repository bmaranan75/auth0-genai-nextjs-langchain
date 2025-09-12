# LangGraph + Auth0 AI Integration Guide

This guide explains how to integrate your Auth0 AI shopping agent with LangGraph for enhanced tracing and observability.

## 🚀 Quick Start

### 1. Get LangSmith API Key
1. Sign up at [LangSmith](https://smith.langchain.com/)
2. Get your API key from the settings
3. Add it to your `.env.local`:
```bash
LANGCHAIN_API_KEY="your-langsmith-api-key"
```

### 2. Start LangGraph Server
```bash
# Start both Next.js and LangGraph in parallel
npm run all:dev

# Or start them separately:
npm run dev:langgraph  # Terminal 1
npm run dev           # Terminal 2
```

### 3. Test the Integration

#### Option A: Use LangGraph Studio (Recommended)
1. Open your browser to `http://127.0.0.1:8123`
2. You'll see the LangGraph Studio interface
3. Test your shopping agent with queries like:
   - "Search for apples"
   - "Add 3 bananas to my cart"
   - "Checkout my cart"

#### Option B: Use API Directly
```bash
# Test via the Next.js API that proxies to LangGraph
curl -X POST http://localhost:3000/api/chat/invoke \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": {
      "messages": [
        {"role": "human", "content": "Search for organic apples"}
      ]
    }
  }'
```

## 📊 Observability Features

### LangSmith Tracing
- **Automatic Tool Tracing**: All tool calls are automatically traced
- **Auth0 Authorization Events**: CIBA flow events are captured
- **User Context**: Each trace includes user information
- **Error Tracking**: Failed authorization and tool errors

### View Traces
1. Go to [LangSmith](https://smith.langchain.com/)
2. Select your project: `auth0-shopping-agent`
3. View real-time traces of:
   - Tool invocations
   - Authorization requests
   - User interactions
   - Error conditions

### Custom Trace Events
The integration includes custom tracing for:
- ✅ Authorization requests
- ✅ Authorization approvals/denials
- ✅ Tool execution start/end
- ✅ User context propagation
- ✅ Error conditions

## 🔧 Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│   Next.js API    │───▶│  LangGraph      │
│   Chat UI       │    │   /api/chat/     │    │  Server         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Auth0 AI       │    │   LangSmith     │
                       │   CIBA Flow      │    │   Tracing       │
                       └──────────────────┘    └─────────────────┘
```

## 🛠 Key Files

- `src/lib/agent.ts` - Main LangGraph agent definition
- `src/lib/auth0-ai-langchain.ts` - Auth0 AI integration with tracing
- `src/lib/tracing.ts` - Custom tracing utilities
- `src/app/api/chat/[..._path]/route.ts` - LangGraph API proxy
- `langgraph.json` - LangGraph configuration

## 🔍 Debugging

### View LangGraph Logs
```bash
# Check LangGraph server logs
npm run dev:langgraph
```

### View Auth0 Authorization Events
Check your console for:
```
[Auth0 Trace] REQUEST: {...}
[Auth0 Trace] APPROVED: {...}
[Auth0 Trace] DENIED: {...}
```

### View Tool Execution Traces
```
[Tracing] Starting checkout-product for user auth0|...
[Tracing] Completed checkout-product for user auth0|...
```

## 📝 Usage Examples

### 1. Product Search with Tracing
```
User: "Find organic bananas"
→ Traces: browse-catalog tool → catalog API → results
```

### 2. Add to Cart with User Context
```
User: "Add 5 apples to my cart"
→ Traces: add-to-cart tool → user context → cart API
```

### 3. Checkout with Authorization
```
User: "Checkout my cart"
→ Traces: checkout-cart tool → CIBA request → user approval → payment API
```

## 🚨 Common Issues

### LangGraph Server Not Starting
```bash
# Kill existing processes
ps aux | grep -E "(node|next)" | grep -v grep
kill -9 <process_id>

# Restart
npm run dev:langgraph
```

### Authorization Not Working
1. Check Auth0 configuration in `.env.local`
2. Verify CIBA is enabled in Auth0 dashboard
3. Check browser console for authorization popup

### Tracing Not Appearing
1. Verify `LANGCHAIN_TRACING_V2="true"`
2. Check LangSmith API key
3. Ensure project name is correct

## 🎯 Next Steps

1. **Custom Dashboards**: Create custom views in LangSmith
2. **Performance Monitoring**: Set up alerts for tool failures
3. **A/B Testing**: Compare different agent configurations
4. **Analytics**: Track user behavior patterns

Happy tracing! 🎉
