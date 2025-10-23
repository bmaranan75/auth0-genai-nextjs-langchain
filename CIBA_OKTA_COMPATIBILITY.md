# CIBA (Client Initiated Backchannel Authentication) with Okta OIE

## Short Answer

**⚠️ Partially Compatible with Modifications Required**

Your current CIBA implementation uses **Auth0's proprietary SDK** (`@auth0/ai-langchain`), which is **Auth0-specific** and will **NOT work directly with Okta OIE**. However, CIBA is an **OpenID standard**, and Okta OIE supports it. You'll need to replace the Auth0 SDK with a standards-based implementation.

## Current Implementation Analysis

### What You're Using Now (Auth0-Specific)

```typescript
// src/lib/auth0-ai-langchain.ts
import { Auth0AI, getAccessTokenForConnection } from '@auth0/ai-langchain';

const auth0AI = new Auth0AI();

export const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
  userID: async (params, config) => { /* ... */ },
  bindingMessage: async (params) => { /* ... */ },
  scopes: ['openid', 'checkout:buy'],
  audience: process.env['SHOP_API_AUDIENCE']!,
  onAuthorizationRequest: async (authReq, poll) => { /* ... */ },
  onUnauthorized: async (e: Error) => { /* ... */ }
});
```

**Dependencies:**
```json
"@auth0/ai-langchain": "^3.4.0"
```

### Why This Won't Work with Okta OIE

1. **Auth0 SDK is proprietary** - Tightly coupled to Auth0's endpoints
2. **Custom API calls** - Uses Auth0-specific backchannel authentication endpoints
3. **Token format expectations** - Expects Auth0 token structure
4. **Configuration** - Hardcoded to Auth0 domain structure

## Okta OIE CIBA Support

### ✅ Good News: Okta Supports CIBA

Okta OIE **does support CIBA** (OpenID CIBA specification):

| Feature | Okta OIE Support | Notes |
|---------|------------------|-------|
| CIBA Flow | ✅ Yes | OpenID CIBA 1.0 compliant |
| Backchannel Auth | ✅ Yes | `/bc-authorize` endpoint |
| Push Notifications | ✅ Yes | Mobile push to Okta Verify |
| Poll Mode | ✅ Yes | Standard polling mechanism |
| Ping Mode | ✅ Yes | Webhook notifications |
| Binding Message | ✅ Yes | Shown to user during approval |
| User Identification | ✅ Yes | By login_hint or id_token_hint |

### Okta CIBA Endpoints

```
# Backchannel Authentication Endpoint
POST https://{org}.okta.com/oauth2/default/v1/bc-authorize

# Token Endpoint (for polling)
POST https://{org}.okta.com/oauth2/default/v1/token
```

## Migration Options

### Option 1: Implement Standard CIBA (Recommended)

Replace Auth0 SDK with standards-based CIBA implementation:

```typescript
// src/lib/okta-ciba.ts
import axios from 'axios';

interface CIBAConfig {
  issuer: string; // https://{org}.okta.com/oauth2/default
  clientId: string;
  clientSecret: string;
  scope: string;
  audience?: string;
}

interface CIBAAuthRequest {
  auth_req_id: string;
  expires_in: number;
  interval: number;
}

/**
 * Initiate CIBA authentication request
 * Works with both Auth0 and Okta OIE
 */
export async function initiateCIBARequest(
  config: CIBAConfig,
  userId: string,
  bindingMessage: string
): Promise<CIBAAuthRequest> {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';
  
  // Determine endpoint based on provider
  const endpoint = provider === 'okta'
    ? `${config.issuer}/v1/bc-authorize`
    : `${config.issuer}/bc-authorize`;

  const response = await axios.post(
    endpoint,
    new URLSearchParams({
      scope: config.scope,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      login_hint: userId, // Email or username
      binding_message: bindingMessage,
      ...(config.audience && { audience: config.audience })
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return {
    auth_req_id: response.data.auth_req_id,
    expires_in: response.data.expires_in,
    interval: response.data.interval || 5
  };
}

/**
 * Poll for CIBA authorization result
 * Works with both Auth0 and Okta OIE
 */
export async function pollCIBAResult(
  config: CIBAConfig,
  authReqId: string,
  interval: number = 5,
  maxAttempts: number = 20
): Promise<{ access_token: string; id_token?: string } | null> {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';
  const tokenEndpoint = provider === 'okta'
    ? `${config.issuer}/v1/token`
    : `${config.issuer}/oauth/token`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));

    try {
      const response = await axios.post(
        tokenEndpoint,
        new URLSearchParams({
          grant_type: 'urn:openid:params:grant-type:ciba',
          auth_req_id: authReqId,
          client_id: config.clientId,
          client_secret: config.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        id_token: response.data.id_token
      };
    } catch (error: any) {
      if (error.response?.data?.error === 'authorization_pending') {
        // User hasn't approved yet, continue polling
        continue;
      }
      
      if (error.response?.data?.error === 'access_denied') {
        // User denied the request
        return null;
      }

      // Other errors
      throw error;
    }
  }

  // Timeout
  throw new Error('CIBA authorization timeout - user did not respond');
}

/**
 * Complete CIBA flow (initiate + poll)
 */
export async function performCIBAAuthorization(
  userId: string,
  bindingMessage: string
): Promise<{ access_token: string; id_token?: string } | null> {
  const config: CIBAConfig = {
    issuer: process.env.AUTH0_ISSUER_BASE_URL!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
    scope: 'openid checkout:buy',
    audience: process.env.SHOP_API_AUDIENCE
  };

  console.log('[CIBA] Initiating authorization request');
  const authReq = await initiateCIBARequest(config, userId, bindingMessage);

  console.log('[CIBA] Polling for user approval');
  const result = await pollCIBAResult(
    config,
    authReq.auth_req_id,
    authReq.interval,
    Math.ceil(authReq.expires_in / authReq.interval)
  );

  return result;
}
```

**Dependencies to add:**
```bash
npm install axios
```

### Option 2: Use Okta SDK (If Available)

Check if Okta has a similar SDK:
```bash
npm search @okta/auth
npm search okta-auth-js
```

Okta's `okta-auth-js` SDK **does not include CIBA helpers** like Auth0's SDK, so Option 1 (standards-based) is recommended.

### Option 3: Hybrid Approach (Use Both SDKs)

Keep both Auth0 and Okta implementations:

```typescript
// src/lib/ciba-provider.ts
import { performCIBAAuthorization as performAuth0CIBA } from './auth0-ai-langchain';
import { performCIBAAuthorization as performOktaCIBA } from './okta-ciba';

export async function performCIBAAuthorization(
  userId: string,
  bindingMessage: string
): Promise<any> {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';

  if (provider === 'okta') {
    return performOktaCIBA(userId, bindingMessage);
  } else {
    return performAuth0CIBA(userId, bindingMessage);
  }
}
```

## Okta CIBA Configuration

### 1. Enable CIBA in Okta

```
Okta Admin Console → Security → API → Authorization Servers
→ Select your authorization server (e.g., "default")
→ Settings

Enable:
✅ Client-Initiated Backchannel Authentication (CIBA)

Configuration:
- Polling interval: 5 seconds
- Token lifetime: 300 seconds (5 minutes)
- Mode: Poll (or Push with Okta Verify)
```

### 2. Configure Application for CIBA

```
Applications → Your Application → General Settings

Grant types enabled:
✅ Client Credentials
✅ CIBA (urn:openid:params:grant-type:ciba)

User consent: Not required for internal apps
```

### 3. Set Up Okta Verify (For Push Mode)

```
Security → Authenticators → Okta Verify
→ Configure push notifications

Users must have Okta Verify app installed on mobile device
```

### 4. Environment Configuration

```bash
# .env.local
IDENTITY_PROVIDER=okta
AUTH0_ISSUER_BASE_URL=https://your-org.okta.com/oauth2/default
AUTH0_CLIENT_ID=your-okta-client-id
AUTH0_CLIENT_SECRET=your-okta-client-secret
SHOP_API_AUDIENCE=api://shop
```

## Key Differences: Auth0 vs Okta CIBA

| Aspect | Auth0 | Okta OIE |
|--------|-------|----------|
| **SDK Available** | ✅ `@auth0/ai-langchain` | ❌ Manual implementation |
| **Endpoint** | `/bc-authorize` | `/v1/bc-authorize` |
| **User Identification** | `login_hint` or `id_token_hint` | Same |
| **Binding Message** | `binding_message` parameter | Same |
| **Poll Endpoint** | `/oauth/token` | `/v1/token` |
| **Grant Type** | `urn:openid:params:grant-type:ciba` | Same (standard) |
| **Mobile Approval** | Auth0 Guardian | Okta Verify |
| **Token Response** | Standard OAuth2 | Same |

## Migration Steps

### Step 1: Install Dependencies

```bash
npm install axios
npm install @types/node  # If not already installed
```

### Step 2: Create Okta CIBA Implementation

Create `/src/lib/okta-ciba.ts` with the code from Option 1 above.

### Step 3: Update Your Auth Wrapper

```typescript
// src/lib/auth0-ai-langchain.ts (or create new ciba-wrapper.ts)

import { performCIBAAuthorization as performOktaCIBA } from './okta-ciba';
import { withAsyncAuthorization as withAuth0Authorization } from './auth0-ai-langchain';

export async function withAsyncAuthorization(tool: any) {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';

  if (provider === 'okta') {
    // Use standards-based CIBA for Okta
    return async (params: any, config: any) => {
      const userId = config?.configurable?._credentials?.user?.sub;
      const bindingMessage = await createBindingMessage(params);
      
      const result = await performOktaCIBA(userId, bindingMessage);
      
      if (!result) {
        throw new Error('User denied authorization');
      }
      
      // Call the actual tool with authorization
      return tool(params, config);
    };
  } else {
    // Use Auth0 SDK
    return withAuth0Authorization(tool);
  }
}
```

### Step 4: Test CIBA Flow

```typescript
// Test with Okta
const result = await performCIBAAuthorization(
  'user@example.com',
  'Do you want to checkout cart with 3 items for $45.99'
);

console.log('CIBA result:', result);
// User approves via Okta Verify app on mobile
```

## Summary

### ✅ What Works with Okta OIE

- ✅ Dual token authentication (already implemented)
- ✅ Client credentials flow
- ✅ User OAuth2 tokens
- ✅ JWT validation with JWKS

### ⚠️ What Needs Modification

- ⚠️ **CIBA implementation** - Requires replacing Auth0 SDK with standards-based code
- ⚠️ **Mobile approval app** - Switch from Auth0 Guardian to Okta Verify
- ⚠️ **Configuration** - Different endpoints and parameters

### 📋 Action Items

1. **Immediate:** Dual token auth works with Okta OIE (already done ✅)
2. **Short-term:** Implement standards-based CIBA (Option 1 above)
3. **Long-term:** Consider abstracting provider-specific logic into strategy pattern

### Recommendation

**Use Option 1 (Standards-Based CIBA)** because:
- ✅ Provider-agnostic (works with Auth0, Okta, Azure AD, etc.)
- ✅ Full control over implementation
- ✅ No vendor lock-in
- ✅ Better for long-term maintenance
- ✅ Follows OpenID CIBA 1.0 specification

The dual token authentication you just implemented will work perfectly with Okta OIE. The CIBA flow requires additional work to replace the Auth0-specific SDK.
