import { Auth0AI, getAccessTokenForConnection } from '@auth0/ai-langchain';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';
import { traceAuthorizationEvent } from './tracing';

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
    
    // Trace authorization request
    traceAuthorizationEvent('request', undefined, { product, qty, message });
    
    return message;
  },
  scopes: ['openid', 'checkout:buy'],
  audience: process.env['SHOP_API_AUDIENCE']!,

  /**
   * When this callback is provided, the tool will initiate the CIBA request
   * and then call this function with the authorization request and polling promise.
   */
  onAuthorizationRequest: async (authReq, poll) => {
    console.log('Authorization request initiated:', authReq);
    traceAuthorizationEvent('request', undefined, { authReq });
    
    // Poll for the result
    try {
      const result = await poll;
      if (result) {
        authorizationState.status = 'approved';
        traceAuthorizationEvent('approved', undefined, { result });
      } else {
        authorizationState.status = 'denied';
        traceAuthorizationEvent('denied', undefined, { reason: 'No result returned' });
      }
    } catch (error) {
      authorizationState.status = 'denied';
      traceAuthorizationEvent('denied', undefined, { error });
      throw error;
    }
  },
  onUnauthorized: async (e: Error) => {
    console.error('Error:', e);
    if (e instanceof AccessDeniedInterrupt) {
      authorizationState = {
        status: 'denied',
        message: 'The user has denied the request'
      };
      traceAuthorizationEvent('denied', undefined, { 
        error: 'AccessDeniedInterrupt',
        message: 'The user has denied the request'
      });
      return 'The user has denied the request';
    }
    authorizationState = {
      status: 'denied',
      message: e.message
    };
    traceAuthorizationEvent('denied', undefined, { 
      error: e.message,
      errorType: e.constructor.name
    });
    return e.message;
  },
});
