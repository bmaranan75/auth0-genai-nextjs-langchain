# LangGraph Multi-Agent Deployment Guide

## Overview

This project now contains a multi-agent LangGraph system with three deployable agents:

1. **Supervisor Agent** (`supervisor`) - Routes requests to specialized agents
2. **Catalog/Cart Agent** (`catalog_cart`) - Handles product discovery and cart management
3. **Payment Agent** (`payment`) - Handles payment method management and setup only

## Architecture

```
User Request → Supervisor Agent → Routes to:
                                ├── Catalog/Cart Agent (product searches, cart operations)
                                └── Payment/Checkout Agent (payments, checkout)
```

## Prerequisites

1. **LangGraph CLI**: Install globally

   ```bash
   npm install -g @langchain/langgraph-cli
   ```

2. **Environment Variables**: Ensure `.env.local` contains:
   ```env
   OPENAI_API_KEY=your_openai_key
   AUTH0_SECRET=your_auth0_secret
   AUTH0_BASE_URL=your_base_url
   AUTH0_ISSUER_BASE_URL=your_issuer_url
   AUTH0_CLIENT_ID=your_client_id
   AUTH0_CLIENT_SECRET=your_client_secret
   SHOP_API_URL=your_shop_api_url
   ```

## Deployment Options

### Option 1: Deploy All Agents (Recommended)

Deploy the entire multi-agent system as a single deployment:

```bash
# Build and package
npm run build

# Deploy to LangGraph Cloud
langgraph deploy --wait

# Or deploy with custom configuration
langgraph deploy --config ./langgraph.json --wait
```

### Option 2: Deploy Individual Agents

Deploy specific agents separately:

```bash
# Deploy only catalog/cart agent
langgraph deploy --graph catalog_cart --wait

# Deploy only payment/checkout agent
langgraph deploy --graph payment --wait

# Deploy supervisor agent
langgraph deploy --graph supervisor --wait
```

## LangGraph Configuration

The `langgraph.json` is configured with:

```json
{
  "dependencies": ["."],
  "graphs": {
    "supervisor": "./src/lib/agents/supervisor.ts:supervisorGraph",
    "catalog": "./src/lib/agents/catalog-agent.ts:catalogGraph",
    "cart_and_checkout": "./src/lib/agents/cart-and-checkout-agent.ts:cartAndCheckoutGraph",
    "payment": "./src/lib/agents/payment-agent.ts:paymentGraph"
  },
  "env": ".env.local",
  "node_version": "20"
}
```

## Local Testing

### Test Individual Agents

```bash
# Test catalog/cart agent
curl -X POST "http://localhost:8000/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "catalog_cart",
    "input": {"messages": [{"role": "user", "content": "Show me apples"}]},
    "stream_mode": "values"
  }'

# Test payment/checkout agent
curl -X POST "http://localhost:8000/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "payment",
    "input": {"messages": [{"role": "user", "content": "I want to checkout"}]},
    "stream_mode": "values"
  }'

# Test supervisor (auto-routing)
curl -X POST "http://localhost:8000/runs/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "supervisor",
    "input": {"messages": [{"role": "user", "content": "Add 5 bananas to cart"}]},
    "stream_mode": "values"
  }'
```

### Run Local LangGraph Server

```bash
# Start local development server
langgraph dev

# Server will be available at http://localhost:8000
# LangGraph Studio at http://localhost:8000/studio
```

## Production Deployment

### Step 1: Prepare for Production

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests (if available)
npm test
```

### Step 2: Deploy to LangGraph Cloud

```bash
# Login to LangGraph Cloud (if needed)
langgraph auth login

# Deploy with production settings
langgraph deploy \
  --wait \
  --tag production \
  --env-file .env.production
```

### Step 3: Configure Environment

Set production environment variables in your deployment:

```env
# Production environment variables
OPENAI_API_KEY=prod_openai_key
AUTH0_SECRET=prod_auth0_secret
AUTH0_BASE_URL=https://your-prod-domain.com
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=prod_client_id
AUTH0_CLIENT_SECRET=prod_client_secret
SHOP_API_URL=https://your-prod-api.com/api
```

## Agent Capabilities

### Catalog/Cart Agent

- **Tools**: `browse_catalog`, `add_to_cart`, `get_user_cart`
- **Use Cases**: Product search, browsing, cart management
- **No Authentication Required**: For browsing and cart operations

### Payment/Checkout Agent

- **Tools**: `checkout_cart`, `add_payment_method`
- **Use Cases**: Order completion, payment processing
- **Authentication Required**: Uses Auth0 CIBA flow

### Supervisor Agent

- **Routing Logic**: Analyzes user intent and routes to appropriate agent
- **Fallback**: Defaults to catalog/cart agent for ambiguous requests

## API Integration

The existing Next.js API routes continue to work unchanged. The multi-agent system is integrated at the `/api/chat` endpoint:

```typescript
// The API automatically uses the supervisor agent
const agent = createAgent(userId);
const result = await agent.invoke({
  messages: [new HumanMessage(userMessage)],
});
```

## Monitoring and Debugging

### LangGraph Studio

Access the visual debugging interface:

```bash
langgraph dev
# Visit http://localhost:8000/studio
```

### Logging

Each agent includes detailed logging:

```typescript
console.log('[agentName] Processing request:', input);
```

### Error Handling

- Built-in tool error handling
- Timeout protection (55s for Vercel compatibility)
- Authorization error recovery

## Scaling Considerations

### Horizontal Scaling

- Each agent can be scaled independently
- Supervisor handles load distribution
- Stateless design for serverless deployment

### Performance Optimization

- 50s timeout for serverless compatibility
- Tool error handling to prevent retry loops
- Optimized LLM settings (gpt-4o-mini, temperature=0)

## Migration from Single Agent

The deployment maintains backward compatibility:

- Existing API routes work unchanged
- UI components continue to function
- Same authentication flow
- Enhanced with intelligent routing

## Troubleshooting

### Common Issues

1. **Agent Not Found**

   ```bash
   # Verify graphs are properly exported
   langgraph build --check
   ```

2. **Tool Import Errors**

   ```bash
   # Check tool exports
   npm run type-check
   ```

3. **Environment Variables**
   ```bash
   # Verify env vars are loaded
   langgraph dev --debug
   ```

### Debug Commands

```bash
# Check configuration
langgraph config show

# View deployment status
langgraph deployments list

# Get deployment logs
langgraph logs <deployment-id>

# Test locally
langgraph dev --port 8000
```

## Next Steps

1. **Monitor Performance**: Use LangGraph Cloud monitoring
2. **Add Analytics**: Implement usage tracking
3. **Expand Agents**: Add specialized agents for recommendations, orders, etc.
4. **A/B Testing**: Test routing logic and agent performance
5. **Integration**: Connect to additional data sources and APIs

This multi-agent architecture provides better separation of concerns, improved maintainability, and enhanced scalability for your grocery shopping assistant.
