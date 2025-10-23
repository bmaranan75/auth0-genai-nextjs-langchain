# Claude Desktop Configuration Guide

## Quick Setup

Your Claude Desktop is now configured to access your MCP server! Here's what you need to do:

### Step 1: Locate Claude Desktop Config File

The configuration file location depends on your OS:

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Step 2: Update Configuration

Copy the contents from your project's `claude_desktop_config.json` to the Claude Desktop config location:

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse",
      "headers": {
        "X-MCP-API-Key": "2cf6ea0bd761a602e81f69aebbc77d676dccf454a5bb650ab8d1f637a249493e"
      }
    }
  }
}
```

### Step 3: Start Your MCP Server

Make sure your MCP server is running:

```bash
# Terminal 1: Start Next.js app
npm run dev

# Terminal 2: Start MCP server
npm run mcp:dev
```

Or use the convenience script:

```bash
./scripts/start-mcp-sse.sh
```

### Step 4: Restart Claude Desktop

1. Quit Claude Desktop completely
2. Relaunch Claude Desktop
3. Claude will automatically connect to your MCP server

### Step 5: Test the Connection

In Claude Desktop, try asking:

```
Can you search for milk in the catalog?
```

or

```
What products do you have access to?
```

Claude should be able to use the MCP tools:
- `catalog_search` - Search products
- `catalog_browse` - Browse by category
- `cart_add` - Add items to cart
- `cart_view` - View cart contents
- `checkout` - Complete checkout with CIBA
- `deals_get` - Get available deals
- `payment_add` - Add payment method

## Configuration Options

### Option 1: API Key Authentication (Current - Recommended for Local Development)

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse",
      "headers": {
        "X-MCP-API-Key": "your-api-key-here"
      }
    }
  }
}
```

✅ Simple and works immediately
✅ Good for local development
✅ Supported by your hybrid auth mode

### Option 2: OAuth2 Client Credentials (Enterprise)

For production or enterprise use:

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <client_credentials_token>"
      }
    }
  }
}
```

**Note:** You'll need to:
1. Set up M2M application in Auth0/Okta
2. Get client credentials token
3. Update the Bearer token periodically (tokens expire)

### Option 3: Dual Token (Enterprise with User Context)

For user-specific operations:

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <client_credentials_token>",
        "X-User-Token": "Bearer <user_oauth2_token>"
      }
    }
  }
}
```

This enables:
- User-specific cart
- Personalized deals
- Checkout with user identity
- Payment methods tied to user

## Troubleshooting

### Claude Desktop Can't Connect

**1. Check MCP Server is Running**
```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "ok",
  "service": "MCP Server",
  "tools": ["catalog_search", "catalog_browse", ...]
}
```

**2. Check Authentication**
```bash
curl http://localhost:3001/sse \
  -H "X-MCP-API-Key: 2cf6ea0bd761a602e81f69aebbc77d676dccf454a5bb650ab8d1f637a249493e"
```

Should establish SSE connection.

**3. Check Claude Desktop Logs**

**macOS:**
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**Windows:**
```
%APPDATA%\Claude\logs\mcp*.log
```

**4. Verify Config File Location**

Make sure you edited the correct file:
```bash
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Should show your configuration
```

### Authentication Errors

**Error: "Unauthorized" or "Invalid API key"**

Solution:
- Verify API key matches `.env.local` MCP_API_KEY
- Check headers are correctly set in config
- Ensure MCP_AUTH_MODE=hybrid in `.env.local`

**Error: "Connection refused"**

Solution:
- Ensure MCP server is running on port 3001
- Check MCP_SERVER_PORT=3001 in `.env.local`
- Verify no firewall blocking localhost:3001

### Tools Not Showing Up

**Issue: Claude says it doesn't have access to tools**

Solution:
1. Check server health endpoint shows all tools
2. Restart Claude Desktop completely (quit, not just close)
3. Clear Claude cache:
   ```bash
   # macOS
   rm -rf ~/Library/Application\ Support/Claude/Cache
   ```
4. Restart Claude Desktop again

## Advanced Configuration

### Multiple MCP Servers

You can configure multiple MCP servers:

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "http://localhost:3001/sse",
      "transport": "sse",
      "headers": {
        "X-MCP-API-Key": "your-api-key"
      }
    },
    "another-mcp-server": {
      "url": "http://localhost:3002/sse",
      "transport": "sse",
      "headers": {
        "X-MCP-API-Key": "another-api-key"
      }
    }
  }
}
```

### Production URL

For production deployment:

```json
{
  "mcpServers": {
    "safeway-shopping-assistant": {
      "url": "https://your-domain.com/mcp/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <your-oauth2-token>",
        "X-User-Token": "Bearer <user-token>"
      }
    }
  }
}
```

## Security Best Practices

### Local Development (Current Setup)

✅ Using API key authentication
✅ Server bound to localhost only
✅ API key in config file (acceptable for local dev)

### Production Deployment

⚠️ **DO NOT use API key authentication in production**

Instead:
1. ✅ Use OAuth2 Client Credentials
2. ✅ Use HTTPS (TLS/SSL)
3. ✅ Implement token rotation
4. ✅ Use environment variables for tokens
5. ✅ Configure WAF with IP whitelisting
6. ✅ Enable rate limiting

## Testing MCP Tools in Claude Desktop

Once configured, you can test each tool:

### 1. Search Products
```
Search for bananas in the catalog
```

### 2. Browse Categories
```
Show me products in the dairy category
```

### 3. Add to Cart
```
Add 2 apples to my cart
```

### 4. View Cart
```
What's in my cart?
```

### 5. Get Deals
```
What deals are available?
```

### 6. Checkout (Requires User Token)
```
I want to checkout my cart
```

**Note:** For checkout to work, you need:
- User token in configuration (dual token mode)
- CIBA configured (Auth0 Guardian or Okta Verify)
- User to approve on mobile device

## Comparison: Claude Desktop vs ChatGPT Enterprise

| Feature | Claude Desktop | ChatGPT Enterprise |
|---------|----------------|-------------------|
| **Connection** | Local config file | Enterprise admin panel |
| **Authentication** | Headers in config | OAuth2 in admin settings |
| **User Context** | Manual token in config | Automatic user token |
| **Deployment** | Developer-configured | IT-managed |
| **Best For** | Development & testing | Production enterprise use |

## Quick Commands Reference

```bash
# Start MCP server
npm run mcp:dev

# Check server health
curl http://localhost:3001/health

# Test authentication
curl -X POST http://localhost:3001/sse \
  -H "X-MCP-API-Key: your-api-key"

# View Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# View MCP server logs
npm run mcp:dev

# Restart everything
# 1. Stop MCP server (Ctrl+C)
# 2. Quit Claude Desktop
# 3. Start MCP server: npm run mcp:dev
# 4. Launch Claude Desktop
```

## What's Next?

✅ **You're all set!** Claude Desktop is configured to use your MCP server.

**To use it:**
1. Make sure MCP server is running (`npm run mcp:dev`)
2. Open Claude Desktop
3. Start asking questions about products, cart, deals, etc.

**For production:**
- See DUAL_TOKEN_COMPLETE.md for OAuth2 setup
- See OKTA_OIE_CONFIGURATION.md for Okta setup
- See PRODUCTION_ARCHITECTURE.md for deployment guide

---

**🎉 Claude Desktop is ready to use your MCP shopping assistant!** 🛒
