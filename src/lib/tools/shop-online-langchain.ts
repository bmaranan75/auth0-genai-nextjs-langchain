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

export const shopOnlineTool = tool(
  async ({ product, qty, priceLimit }) => {
    console.log(`Ordering ${qty} ${product} with price limit ${priceLimit}`);

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

    // Get the access token from CIBA credentials
    const credentials = getCIBACredentials();
    const accessToken = credentials?.accessToken;

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log(`[shop-online] Using access token: ${accessToken.substring(0, 20)}...`);
      
      // Mark authorization as approved since we have valid credentials
      setAuthorizationApproved();
    } else {
      console.log('[shop-online] No access token available');
      throw new Error('No access token available - authorization required');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const result = await response.text();
    return result || `Successfully ordered ${qty} ${product}`;
  },
  {
    name: 'shopOnline',
    description: 'Tool to buy products online',
    schema: z.object({
      product: z.string(),
      qty: z.number(),
      priceLimit: z.number().optional(),
    }),
  },
);
