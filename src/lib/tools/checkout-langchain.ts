import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCIBACredentials } from '@auth0/ai-langchain';

// Import authorization state management
let authorizationState: { status: string; message?: string } | null = null;

// Function to set authorization as approved when we get credentials
const setAuthorizationApproved = () => {
  authorizationState = { status: 'approved' };
};

// Export function to get and reset state
export const getShopAuthState = () => authorizationState;
export const resetShopAuthState = () => {
  authorizationState = null;
};

export const checkoutTool = tool(
  async ({ product, qty, priceLimit }) => {
    console.log(`[checkout-tool] Processing order: ${qty} ${product} with price limit ${priceLimit}`);

    const apiUrl = process.env['SHOP_API_URL'] || 'http://localhost:3000/api/checkout';

    if (!apiUrl) {
      // No API set, mock a response
      return `Ordered ${qty} ${product}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const body = {
      product,
      qty,
      priceLimit,
    };

    // The withAsyncAuthorization wrapper will provide the access token through CIBA credentials
    // We should NOT check for missing credentials here - let the wrapper handle authorization
    const credentials = getCIBACredentials();
    const accessToken = credentials?.accessToken;

    console.log(`[checkout-tool] Access token available: ${!!accessToken}`);

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log(`[checkout-tool] Using access token: ${accessToken.substring(0, 20)}...`);
      
      // Mark authorization as approved since we have valid credentials
      setAuthorizationApproved();
    }
    // NOTE: We don't throw an error if no access token - the withAsyncAuthorization wrapper
    // will handle the CIBA flow and retry this tool with proper credentials

    console.log(`[checkout-tool] Making API call to: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    console.log(`[checkout-tool] API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[checkout-tool] API error: ${response.status} - ${errorText}`);
      throw new Error(`Checkout failed: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log(`[checkout-tool] API response: ${result}`);
    return result || `Successfully ordered ${qty} ${product}`;
  },
  {
    name: 'checkout',
    description: 'Tool to checkout and complete grocery orders. Accepts the user\'s cart contents with product details, quantities, and total price. Calls the checkout API to process payment and finalize the order for delivery.',
    schema: z.object({
      product: z.string(),
      qty: z.number(),
      priceLimit: z.number().optional(),
    }),
  },
);
