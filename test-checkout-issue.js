#!/usr/bin/env node

// Test script to investigate the "please do not checkout" issue
async function testCheckoutIssue() {
  console.log('🔍 Testing checkout tool behavior with different prompts...\n');

  const baseUrl = 'http://localhost:3000';
  
  const testPrompts = [
    "please do not checkout",
    "do not checkout", 
    "don't checkout",
    "please proceed with checkout",
    "checkout my cart",
    "I want to buy these items"
  ];

  for (const prompt of testPrompts) {
    console.log(`\n📝 Testing prompt: "${prompt}"`);
    console.log('=' .repeat(50));
    
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'human',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status}`);
        const text = await response.text();
        console.log(`Response: ${text.substring(0, 200)}...`);
        continue;
      }

      const result = await response.json();
      
      // Check if any tools were called (we'll look at the server logs)
      console.log(`✅ Response: ${result.message}`);
      
      if (result.authorizationStatus) {
        console.log(`🔐 Authorization Status: ${result.authorizationStatus}`);
      }

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n🏁 Test completed!');
  console.log('\nTo analyze the results:');
  console.log('1. Check the server logs above for tool calls');
  console.log('2. Look for any checkout_cart tool invocations');
  console.log('3. Compare behavior between "do not checkout" vs "checkout" prompts');
}

testCheckoutIssue().catch(console.error);
