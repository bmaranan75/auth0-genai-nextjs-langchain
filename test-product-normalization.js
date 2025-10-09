#!/usr/bin/env node

// Test the add-to-cart API directly to verify product normalization works
async function testAddToCart() {
  console.log('🧪 Testing add-to-cart API with product normalization...\n');

  const baseUrl = 'http://localhost:3000';

  const testCases = [
    {productCode: 'apple', productName: 'apple', userId: 'test-user'},
    {productCode: 'apples', productName: 'apples', userId: 'test-user'},
    {productName: 'apples', userId: 'test-user'}, // only productName, no code
    {productCode: 'banana', userId: 'test-user'},
    {productCode: 'bananas', userId: 'test-user'},
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Testing: ${JSON.stringify(testCase)}`);
    console.log('='.repeat(60));

    try {
      const response = await fetch(`${baseUrl}/api/add-to-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 1,
          ...testCase,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ SUCCESS: ${result.message}`);
        console.log(`   Product ID: ${result.cartItem?.id}`);
        console.log(`   Price: $${result.cartItem?.price}`);
      } else {
        console.log(`❌ FAILED: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 ERROR: ${error.message}`);
    }
  }
}

// Test the catalog API directly
async function testCatalogAPI() {
  console.log('\n🔍 Testing catalog API for product lookup...\n');

  const baseUrl = 'http://localhost:3000';

  const productCodes = ['apple', 'apples', 'banana', 'bananas', 'nonexistent'];

  for (const productCode of productCodes) {
    console.log(`\n📝 Testing catalog lookup: ${productCode}`);
    console.log('='.repeat(40));

    try {
      const response = await fetch(`${baseUrl}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({productCode}),
      });

      const result = await response.json();

      if (response.ok) {
        console.log(
          `✅ FOUND: ${result.product?.id} - $${result.product?.price}`,
        );
      } else {
        console.log(`❌ NOT FOUND: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 ERROR: ${error.message}`);
    }
  }
}

// Run the tests
async function runTests() {
  await testCatalogAPI();
  await testAddToCart();
}

runTests().catch(console.error);
