# Quick Start: Okta OIE Configuration

## TL;DR - Switch from Auth0 to Okta OIE

### 1. Update `.env.local`

```bash
# Set identity provider
IDENTITY_PROVIDER=okta

# Update issuer URL
AUTH0_ISSUER_BASE_URL=https://your-org.okta.com/oauth2/default

# Update client ID (from your Next.js app in Okta)
AUTH0_CLIENT_ID=your-okta-app-client-id

# Update client secret
AUTH0_CLIENT_SECRET=your-okta-app-client-secret

# Set API audience (Okta format)
MCP_API_AUDIENCE=api://mcp-server

# Add allowed ChatGPT Enterprise client
ALLOWED_MCP_CLIENTS=chatgpt_okta_client_id
```

### 2. That's it! ✅

The code automatically:
- Uses Okta JWKS endpoint (`/v1/keys`)
- Supports Okta token claims (`cid`, `scp`)
- Validates tokens with Okta signature

## Side-by-Side Comparison

| Configuration | Auth0 | Okta OIE |
|--------------|-------|----------|
| **Identity Provider** | `IDENTITY_PROVIDER=auth0` (or omit) | `IDENTITY_PROVIDER=okta` |
| **Issuer URL** | `https://tenant.auth0.com/` | `https://org.okta.com/oauth2/default` |
| **JWKS Endpoint** | `/.well-known/jwks.json` | `/v1/keys` |
| **API Audience** | `https://yourdomain.com/mcp` | `api://mcp-server` |
| **Client ID Claim** | `azp`, `client_id`, `sub` | `cid`, `sub` |
| **Scopes Claim** | `scope` (string) | `scp` (array or string) |
| **Token Endpoint** | `/oauth/token` | `/oauth2/default/v1/token` |

## Get Okta Client Credentials Token

```bash
curl -X POST https://your-org.okta.com/oauth2/default/v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=mcp:execute"
```

## Test MCP with Okta Token

```bash
curl -X POST http://localhost:3000/api/mcp/agents/catalog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <okta_access_token>" \
  -d '{"action": "search", "query": "milk"}'
```

## See Full Documentation

- **OKTA_OIE_CONFIGURATION.md** - Complete setup guide with Okta Admin Console steps
- **DUAL_TOKEN_IMPLEMENTATION.md** - Architecture and OAuth2 flow details
