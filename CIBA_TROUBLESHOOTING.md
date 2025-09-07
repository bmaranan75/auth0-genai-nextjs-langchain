# CIBA (Client Initiated Backchannel Authentication) Issues and Solutions

## Current Issue

You're seeing status messages in the chat but not receiving CIBA notifications. This indicates the Auth0 AI SDK is attempting to trigger CIBA flows, but the notifications aren't reaching you.

## Root Cause Analysis

Based on the diagnostic results, here are the likely causes:

### 1. Auth0 Tenant Configuration

**Most Likely Issue**: Your Auth0 tenant may not have CIBA enabled or properly configured.

**Check:**

- CIBA feature availability in your Auth0 plan
- CIBA grant type enabled for your application
- Backchannel authentication endpoint configuration

### 2. Application Configuration

Your Auth0 application needs specific CIBA settings:

**Required Configuration:**

```json
{
  "grant_types": [
    "authorization_code",
    "refresh_token",
    "urn:openid:params:grant-type:ciba"
  ],
  "token_endpoint_auth_method": "client_secret_post",
  "backchannel_token_delivery_mode": "poll"
}
```

### 3. User Setup

CIBA requires user device setup:

- Auth0 Guardian app installed (for push notifications)
- OR polling mode configured (for web-based approval)

## Solutions

### Solution 1: Enable CIBA in Auth0 Dashboard

1. **Go to Auth0 Dashboard** → Applications → Your Application
2. **Settings Tab** → Advanced Settings → Grant Types
3. **Enable**: "Client Initiated Backchannel Authentication (CIBA)"
4. **Save Changes**

### Solution 2: Configure Application for CIBA

Update your Auth0 application settings:

```bash
# Using Auth0 CLI or Management API
curl -X PATCH "https://${AUTH0_DOMAIN}/api/v2/clients/${CLIENT_ID}" \
  -H "Authorization: Bearer ${MANAGEMENT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_types": [
      "authorization_code",
      "refresh_token",
      "urn:openid:params:grant-type:ciba"
    ],
    "token_endpoint_auth_method": "client_secret_post",
    "backchannel_token_delivery_mode": "poll"
  }'
```

### Solution 3: Implement Polling Mode (Fallback)

If push notifications aren't working, switch to polling mode:

```typescript
// In auth0-ai.ts, update the configuration
export const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
  userID: async () => {
    const user = await getUser();
    return user?.sub as string;
  },
  bindingMessage: async ({product, qty}) =>
    `Purchase approval: ${qty} ${product}`,
  scopes: ['openid', 'checkout:buy'],
  audience: process.env['SHOP_API_AUDIENCE']!,
  onAuthorizationRequest: 'poll', // Changed from "block" to "poll"
  pollingInterval: 2000, // Poll every 2 seconds
  timeout: 30000, // 30 second timeout
  onUnauthorized: async (e: Error) => {
    // Enhanced error handling...
  },
});
```

### Solution 4: Development Mode Workaround

For development/testing, implement a mock approval flow:

```typescript
// Add to .env.local
NEXT_PUBLIC_DEMO = 'true';

// In auth0-ai.ts
const isDemoMode = process.env.NEXT_PUBLIC_DEMO === 'true';

export const withAsyncAuthorization = isDemoMode
  ? (tool: any) => tool // Skip CIBA in demo mode
  : auth0AI.withAsyncUserConfirmation({
      // ... normal CIBA configuration
    });
```

## Testing Steps

### 1. Test CIBA Configuration

Visit: http://localhost:3000/api/debug-ciba

### 2. Test Authentication

Visit: http://localhost:3000/api/auth-status

### 3. Test CIBA Flow

Use the chat to request: "I want to buy 2 apples"

### 4. Check Console Logs

Monitor browser console and terminal for CIBA-specific errors.

## Expected Behavior

**With CIBA Working:**

1. User requests purchase in chat
2. System shows: "I'll need your authorization..."
3. User receives push notification OR polling prompt
4. User approves/denies
5. Purchase proceeds or cancels

**Current Behavior:**

1. User requests purchase
2. System shows status message
3. No notification received
4. Process hangs or fails

## Immediate Fix

Try updating the CIBA configuration to use polling mode:

```typescript
// In src/lib/auth0-ai.ts
onAuthorizationRequest: "poll", // Instead of "block"
```

This will show a web-based approval interface instead of requiring push notifications.

## Long-term Solution

1. Contact Auth0 support to enable CIBA for your tenant
2. Configure Auth0 Guardian for push notifications
3. Test with actual CIBA-enabled users

## Environment Variables to Check

```bash
# Ensure these are set correctly
AUTH0_DOMAIN="your-tenant.auth0.com"
AUTH0_CLIENT_ID="your-client-id"
AUTH0_CLIENT_SECRET="your-client-secret"
AUTH0_ISSUER_BASE_URL="https://your-tenant.auth0.com"
SHOP_API_AUDIENCE="http://localhost:3000/api/checkout"
ADD_PAYMENT_API_AUDIENCE="http://localhost:3000/api/add-payment"
```

## Next Steps

1. Try the polling mode fix first (quickest)
2. Check Auth0 Dashboard for CIBA settings
3. Test with the debug endpoints
4. Contact Auth0 support if needed
