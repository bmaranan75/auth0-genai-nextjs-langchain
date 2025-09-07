#!/usr/bin/env node

/**
 * Debug script to check CIBA (Client Initiated Backchannel Authentication) configuration
 * Run this with: node debug-ciba.js
 */

require('dotenv').config({path: '.env.local'});

const auth0Domain = process.env.AUTH0_DOMAIN;
const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const issuerBaseUrl = process.env.AUTH0_ISSUER_BASE_URL;

console.log('🔍 Auth0 CIBA Configuration Debug');
console.log('================================');

// Check environment variables
console.log('\n📋 Environment Variables:');
console.log('AUTH0_DOMAIN:', auth0Domain || '❌ Missing');
console.log('AUTH0_CLIENT_ID:', clientId || '❌ Missing');
console.log('AUTH0_CLIENT_SECRET:', clientSecret ? '✅ Set' : '❌ Missing');
console.log('AUTH0_ISSUER_BASE_URL:', issuerBaseUrl || '❌ Missing');

if (!auth0Domain || !clientId || !clientSecret) {
  console.log('\n❌ Missing required Auth0 environment variables');
  process.exit(1);
}

// Check if Auth0 tenant supports CIBA
async function checkCIBASupport() {
  try {
    console.log('\n🌐 Checking Auth0 tenant CIBA support...');

    // Get Management API access token
    const tokenResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${auth0Domain}/api/v2/`,
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get management token: ${tokenResponse.status}`,
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    console.log('✅ Successfully obtained Management API token');

    // Check client configuration
    console.log('\n🔧 Checking client configuration...');
    const clientResponse = await fetch(
      `https://${auth0Domain}/api/v2/clients/${clientId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!clientResponse.ok) {
      throw new Error(`Failed to get client info: ${clientResponse.status}`);
    }

    const clientData = await clientResponse.json();

    console.log('Client Name:', clientData.name);
    console.log('Client Type:', clientData.app_type);
    console.log(
      'Token Endpoint Auth Method:',
      clientData.token_endpoint_auth_method,
    );

    // Check if CIBA is supported
    const supportsCIBA =
      clientData.client_authentication_methods?.includes(
        'client_secret_basic',
      ) ||
      clientData.client_authentication_methods?.includes('client_secret_post');

    console.log('Supports CIBA:', supportsCIBA ? '✅ Yes' : '❌ No');

    if (clientData.grant_types) {
      console.log('Grant Types:', clientData.grant_types);
      const hasCIBAGrant = clientData.grant_types.includes(
        'urn:openid:params:grant-type:ciba',
      );
      console.log('Has CIBA Grant Type:', hasCIBAGrant ? '✅ Yes' : '❌ No');
    }

    // Check tenant features
    console.log('\n🏢 Checking tenant features...');
    const tenantResponse = await fetch(
      `https://${auth0Domain}/api/v2/tenants/settings`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (tenantResponse.ok) {
      const tenantData = await tenantResponse.json();
      console.log(
        'Tenant Features:',
        tenantData.enabled_locales || 'Not specified',
      );
    }

    // Test CIBA discovery endpoint
    console.log('\n🔍 Testing CIBA discovery...');
    const discoveryResponse = await fetch(
      `https://${auth0Domain}/.well-known/openid_configuration`,
    );

    if (discoveryResponse.ok) {
      const discoveryData = await discoveryResponse.json();
      const supportsCIBAEndpoint =
        !!discoveryData.backchannel_authentication_endpoint;
      console.log(
        'CIBA Endpoint Available:',
        supportsCIBAEndpoint ? '✅ Yes' : '❌ No',
      );

      if (supportsCIBAEndpoint) {
        console.log(
          'CIBA Endpoint:',
          discoveryData.backchannel_authentication_endpoint,
        );
      }

      console.log(
        'Supported Grant Types:',
        discoveryData.grant_types_supported || [],
      );
    }
  } catch (error) {
    console.error('\n❌ Error checking CIBA support:', error.message);
  }
}

// Test CIBA flow simulation
async function testCIBAFlow() {
  try {
    console.log('\n🧪 Testing CIBA flow simulation...');

    // This is a basic test to see if the CIBA endpoint responds
    const cibaResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:openid:params:grant-type:ciba',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid profile checkout:buy',
        binding_message: 'Test CIBA flow',
        // Note: This will fail without proper user setup, but we can see the error
      }),
    });

    const cibaData = await cibaResponse.json();
    console.log('CIBA Response Status:', cibaResponse.status);
    console.log('CIBA Response:', cibaData);

    if (
      cibaResponse.status === 400 &&
      cibaData.error === 'unsupported_grant_type'
    ) {
      console.log('❌ CIBA grant type not supported by this tenant');
    } else if (
      cibaResponse.status === 400 &&
      cibaData.error === 'invalid_request'
    ) {
      console.log(
        '⚠️ CIBA endpoint exists but request invalid (expected for test)',
      );
    } else {
      console.log('✅ CIBA endpoint appears to be functional');
    }
  } catch (error) {
    console.error('\n❌ Error testing CIBA flow:', error.message);
  }
}

// Main execution
async function main() {
  await checkCIBASupport();
  await testCIBAFlow();

  console.log('\n📝 Summary and Recommendations:');
  console.log('================================');
  console.log(
    '1. If CIBA is not supported, contact Auth0 support to enable it',
  );
  console.log(
    '2. Ensure your Auth0 application has the CIBA grant type enabled',
  );
  console.log('3. Configure push notifications or polling mode for CIBA');
  console.log('4. Verify client authentication method supports CIBA');
  console.log(
    '\n📖 For more info: https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow',
  );
}

main().catch(console.error);
