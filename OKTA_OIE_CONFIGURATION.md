# Okta OIE Configuration for Dual Token Authentication

## Overview

The dual token authentication implementation is **fully compatible with Okta OIE (Okta Identity Engine)**. This document explains how to configure it for Okta instead of Auth0.

## Key Differences: Auth0 vs Okta OIE

| Feature | Auth0 | Okta OIE | Impact |
|---------|-------|----------|--------|
| JWKS Endpoint | `{domain}/.well-known/jwks.json` | `{domain}/oauth2/default/v1/keys` | Change URL |
| Issuer URL | `https://{tenant}.{region}.auth0.com` | `https://{org}.okta.com/oauth2/default` | Change issuer |
| Client ID Claim | `azp`, `client_id`, or `sub` | `cid` (client credentials) | Already handled |
| User ID Claim | `sub` | `sub` | ✅ Same |
| Grant Type Claim | `gty` | Not always present | Code handles both |
| Scopes Format | Space-delimited string | Space-delimited or array | ✅ Already handled |

## Configuration Steps

### Step 1: Update Environment Variables

Replace your Auth0 configuration with Okta OIE:

```bash
# .env.local

# ============================================================
# Okta OIE Configuration (instead of Auth0)
# ============================================================

# Okta Domain (your Okta organization)
AUTH0_ISSUER_BASE_URL=https://your-org.okta.com/oauth2/default
# Note: Keep the variable name AUTH0_ISSUER_BASE_URL for compatibility
# Or create a new OKTA_ISSUER_URL and update code

# Client ID (from your Next.js app in Okta)
AUTH0_CLIENT_ID=your-okta-client-id

# Client Secret (from your Next.js app in Okta)
AUTH0_CLIENT_SECRET=your-okta-client-secret

# MCP Authentication
MCP_AUTH_MODE=hybrid  # Supports both API key and OAuth2

# MCP API Audience (Okta uses "aud" claim)
# This should match your API identifier in Okta
MCP_API_AUDIENCE=api://mcp-server
# Okta format: api://{identifier} or https://your-domain.com/mcp

# Allowed MCP Clients (ChatGPT Enterprise client ID from Okta)
ALLOWED_MCP_CLIENTS=chatgpt_enterprise_okta_client_id,another_client_id

# Required Scopes
REQUIRED_MCP_SCOPES=mcp:execute

# Legacy API Key (for backward compatibility)
MCP_API_KEY=your-existing-api-key
```

### Step 2: Update JWKS Client Configuration

The current code uses:
```typescript
const auth0Client = jwksClient({
  jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL}/.well-known/jwks.json`,
  // ...
});
```

**For Okta OIE, update to:**

```typescript
const jwksUri = process.env.OKTA_JWKS_URI || 
  `${process.env.AUTH0_ISSUER_BASE_URL}/v1/keys`;
```

✅ **DONE! Code has been updated to automatically detect and support both Auth0 and Okta OIE.**

Just set `IDENTITY_PROVIDER=okta` in your `.env.local` file.

### Step 3: Set Identity Provider

Add this to your `.env.local`:

```bash
# Identity Provider: auth0 (default) or okta
IDENTITY_PROVIDER=okta
```

## Okta OIE Setup

### 1. Create API in Okta

```
Okta Admin Console → Applications → Applications
→ Create App Integration

App integration name: MCP API
Grant type: Client Credentials

API Scopes:
- mcp:execute (custom scope)
```

### 2. Create Machine-to-Machine Application (ChatGPT Enterprise)

```
Okta Admin Console → Applications → Applications
→ Create App Integration

Sign-in method: API Services (OAuth 2.0 Client Credentials)
App integration name: ChatGPT Enterprise MCP Client

Grant Types:
✅ Client Credentials

Assignments:
- Assign to groups or users as needed
```

### 3. Configure Authorization Server

```
Okta Admin Console → Security → API
→ Authorization Servers → default (or create new)

Scopes:
- Name: mcp:execute
  Description: Execute MCP tools
  
Claims:
- Name: client_id
  Include in token type: Access Token
  Value type: Expression
  Value: app.clientId
  Include in: Any scope
```

### 4. Get Configuration Values

From your ChatGPT Enterprise M2M app:
- **Client ID**: Copy this value
- **Client Secret**: Copy this value (keep secure!)

Update `.env.local`:
```bash
ALLOWED_MCP_CLIENTS=<chatgpt_client_id_from_okta>
```

## Token Claims Comparison

### Client Credentials Token

**Auth0:**
```json
{
  "iss": "https://tenant.auth0.com/",
  "sub": "client_id@clients",
  "aud": "https://yourdomain.com/mcp",
  "azp": "client_id",
  "gty": "client-credentials",
  "scope": "mcp:execute"
}
```

**Okta OIE:**
```json
{
  "iss": "https://your-org.okta.com/oauth2/default",
  "sub": "client_id",
  "aud": "api://mcp-server",
  "cid": "client_id",
  "uid": "client_id",
  "scp": ["mcp:execute"]
}
```

✅ **Code handles both formats automatically**

### User Token

**Auth0:**
```json
{
  "iss": "https://tenant.auth0.com/",
  "sub": "auth0|user123",
  "aud": "your_app_client_id",
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Okta OIE:**
```json
{
  "iss": "https://your-org.okta.com/oauth2/default",
  "sub": "00u123abc",
  "aud": "your_app_client_id",
  "email": "user@example.com",
  "name": "John Doe",
  "preferred_username": "user@example.com"
}
```

✅ **Code handles both formats automatically**

## Testing with Okta OIE

### Test 1: Client Credentials Token Only

```bash
# Get client credentials token from Okta
curl -X POST https://your-org.okta.com/oauth2/default/v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=mcp:execute"

# Response:
{
  "access_token": "eyJraWQ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp:execute"
}

# Use the token
curl -X POST http://localhost:3000/api/mcp/agents/catalog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJraWQ..." \
  -d '{"action": "search", "query": "milk"}'
```

### Test 2: Dual Token (Client + User)

```bash
# Use client credentials token + user OAuth2 token
curl -X POST http://localhost:3000/api/mcp/agents/cart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <client_credentials_token>" \
  -H "X-User-Token: Bearer <user_oauth2_token>" \
  -d '{"action": "checkout", "cartSummary": "..."}'
```

## Code Changes Made

### ✅ Updated: `src/lib/mcp/dual-token-auth.ts`

1. **Dynamic JWKS URI Detection**
   ```typescript
   function getJwksUri(): string {
     const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';
     switch (provider) {
       case 'okta':
         return `${issuerBaseUrl}/v1/keys`;
       case 'auth0':
       default:
         return `${issuerBaseUrl}/.well-known/jwks.json`;
     }
   }
   ```

2. **Okta Client ID Claim Support**
   ```typescript
   // Now supports: cid (Okta), azp (Auth0), client_id, sub
   const clientId = verified.cid || verified.azp || verified.client_id || verified.sub;
   ```

3. **Flexible Scope Handling**
   - Already supported both string and array formats
   - Works with Auth0 `scope` and Okta `scp` claims

## Migration Checklist

- [ ] Set `IDENTITY_PROVIDER=okta` in `.env.local`
- [ ] Update `AUTH0_ISSUER_BASE_URL` to your Okta domain
- [ ] Update `MCP_API_AUDIENCE` to match Okta API identifier
- [ ] Create API in Okta Admin Console
- [ ] Create M2M app for ChatGPT Enterprise
- [ ] Configure authorization server scopes
- [ ] Update `ALLOWED_MCP_CLIENTS` with Okta client ID
- [ ] Test client credentials flow
- [ ] Test dual token flow
- [ ] Update ChatGPT Enterprise configuration

## Summary

✅ **Dual token authentication now supports both Auth0 and Okta OIE**
✅ **Automatic detection based on `IDENTITY_PROVIDER` environment variable**
✅ **Zero breaking changes to existing Auth0 implementations**
✅ **Compatible with standard OAuth2 flows**

The implementation follows OAuth2 standards, so it will work with any compliant identity provider (Auth0, Okta OIE, Azure AD, etc.) with minimal configuration changes.


