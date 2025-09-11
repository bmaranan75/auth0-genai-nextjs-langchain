/**
 * Test script for the add-to-cart API endpoint
 *
 * This script tests:
 * 1. Health check (GET request)
 * 2. Adding item to cart with valid authentication
 * 3. Error handling for missing authentication
 * 4. Error handling for missing required fields
 */

// Mock a simple access token for testing (in production, this would come from Auth0)
const mockAccessToken =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5In0.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCIsImlhdCI6MTYzMDAwMDAwMCwiZXhwIjoxNjMwMDAzNjAwfQ.test-signature';

async function testAddToCartAPI() {
  const baseUrl = 'http://localhost:3000/api/add-to-cart';

  console.log('🧪 Testing Add to Cart API...\n');

  // Test 1: Health check
  console.log('1. Testing health check (GET)...');
  try {
    const response = await fetch(baseUrl);
    const data = await response.json();
    console.log('✅ Health check response:', data);
  } catch (error) {
    console.log('❌ Health check failed:', error);
  }
  console.log('');

  // Test 2: Add item to cart with authentication
  console.log('2. Testing add to cart with product code...');
  try {
    const cartItem = {
      productCode: 'TS001', // Classic Cotton T-Shirt
      quantity: 2,
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mockAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cartItem),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Add to cart successful:', data);
    } else {
      console.log('❌ Add to cart failed:', data);
    }
  } catch (error) {
    console.log('❌ Add to cart request failed:', error);
  }
  console.log('');

  // Test 2b: Add item to cart with product name
  console.log('2b. Testing add to cart with product name...');
  try {
    const cartItem = {
      productName: 'Jeans', // Should match "Slim Fit Jeans"
      quantity: 1,
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mockAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cartItem),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Add to cart with name successful:', data);
    } else {
      console.log('❌ Add to cart with name failed:', data);
    }
  } catch (error) {
    console.log('❌ Add to cart request failed:', error);
  }
  console.log('');

  // Test 3: Missing authentication
  console.log('3. Testing without authentication...');
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({productId: 'test-product'}),
    });

    const data = await response.json();
    console.log('Expected error response:', data);
  } catch (error) {
    console.log('❌ Request failed:', error);
  }
  console.log('');

  // Test 4: Missing required fields
  console.log('4. Testing with missing product identifier...');
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mockAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({quantity: 1}), // Missing productCode and productName
    });

    const data = await response.json();
    console.log('Expected validation error:', data);
  } catch (error) {
    console.log('❌ Request failed:', error);
  }
  console.log('');

  // Test 5: Test catalog browsing
  console.log('5. Testing catalog browsing...');
  try {
    const catalogResponse = await fetch('http://localhost:3000/api/catalog');
    const catalogData = await catalogResponse.json();

    if (catalogResponse.ok) {
      console.log('✅ Catalog browse successful. Available products:');
      catalogData.products.slice(0, 5).forEach((product, index) => {
        console.log(
          `   ${index + 1}. ${product.code} - ${product.name} ($${product.price})`,
        );
      });
      console.log(
        `   ... and ${catalogData.pagination.total - 5} more products`,
      );
    } else {
      console.log('❌ Catalog browse failed:', catalogData);
    }
  } catch (error) {
    console.log('❌ Catalog request failed:', error);
  }
  console.log('');

  console.log('🏁 Testing completed!');
}

// Usage instructions
console.log(`
📋 Add to Cart API Test Script

To run this test:
1. Start your Next.js development server: npm run dev
2. Run this script: node test-add-to-cart.js

Expected behavior:
- Health check should return status 'ok'
- Valid cart item should be added successfully
- Missing auth should return 401 error
- Missing productId should return 400 error

Note: This test uses a mock token. In production, you would need a valid Auth0 access token.
`);

// Uncomment the line below to run the test
// testAddToCartAPI();

export {testAddToCartAPI};
