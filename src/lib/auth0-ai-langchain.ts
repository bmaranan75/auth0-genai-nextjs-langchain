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
    const { getShopAuthState } = require('./tools/shop-online-langchain');
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
    const { resetShopAuthState } = require('./tools/shop-online-langchain');
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
   * When this flag is set to `block`, the execution of the tool awaits
   * until the user approves or rejects the request.
   *
   * Given the asynchronous nature of the CIBA flow, this mode
   * is only useful during development.
   *
   * In practice, the process that is awaiting the user confirmation
   * could crash or timeout before the user approves the request.
   */
  onAuthorizationRequest: 'block',
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
