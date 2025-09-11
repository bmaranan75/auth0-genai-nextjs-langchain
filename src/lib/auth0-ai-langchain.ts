import { Auth0AI, getAccessTokenForConnection } from '@auth0/ai-langchain';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

// Get the access token for a connection via Auth0
export const getAccessToken = async () => getAccessTokenForConnection();

const auth0AI = new Auth0AI();

// Global state to track authorization status
export let authorizationState: {
  status: 'idle' | 'requested' | 'pending' | 'approved' | 'denied';
  message?: string;
} = { status: 'idle' };

export const getAuthorizationState = () => {
  // Check if tool has marked auth as approved
  try {
    const { getShopAuthState } = require('./tools/checkout-langchain');
    const shopState = getShopAuthState();
    if (shopState?.status === 'approved' && authorizationState.status === 'requested') {
      authorizationState.status = 'approved';
    }
  } catch (e) {
    // Ignore if shop tool not available
  }
  return authorizationState;
};

export const resetAuthorizationState = () => {
  authorizationState = { status: 'idle' };
  // Also reset shop auth state
  try {
    const { resetShopAuthState } = require('./tools/checkout-langchain');
    resetShopAuthState();
  } catch (e) {
    // Ignore if shop tool not available
  }
};

// CIBA flow for user confirmation
export const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
  userID: async (_params, config) => {
    return config?.configurable?._credentials?.user?.sub;
  },
  bindingMessage: async ({ product, qty }) => {
    const message = `Do you want to buy ${qty} ${product}`;
    authorizationState = {
      status: 'requested',
      message
    };
    return message;
  },
  scopes: ['openid', 'checkout:buy'],
  audience: process.env['SHOP_API_AUDIENCE']!,

  /**
   * When this flag is set to `poll`, the tool will initiate the CIBA request
   * and then poll for authorization completion, showing a web-based interface
   * for user approval.
   *
   * When set to `block`, the execution awaits until the user approves or rejects.
   * However, given the asynchronous nature of the CIBA flow, polling mode 
   * is more reliable for production use.
   */
  onAuthorizationRequest: 'poll', // Changed from 'block' to 'poll'
  pollingInterval: 2000, // Poll every 2 seconds
  timeout: 30000, // 30 second timeout
  onUnauthorized: async (e: Error) => {
    console.error('Error:', e);
    if (e instanceof AccessDeniedInterrupt) {
      authorizationState = {
        status: 'denied',
        message: 'The user has denied the request'
      };
      return 'The user has denied the request';
    }
    authorizationState = {
      status: 'denied',
      message: e.message
    };
    return e.message;
  },
});
