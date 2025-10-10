const {
  CartAndCheckoutAgent,
} = require('./src/lib/agents/cart-and-checkout-agent.js');

async function testAddToCartBehavior() {
  console.log('🧪 TESTING ADD TO CART BEHAVIOR');
  console.log('='.repeat(50));

  try {
    // Set environment variables for testing
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
    process.env.LANGCHAIN_TRACING_V2 = 'false';

    const agent = new CartAndCheckoutAgent('test-user');

    const testMessage = 'Add bananas to my cart';
    console.log(`📝 Test Message: "${testMessage}"`);
    console.log('⏳ Processing...\n');

    const response = await agent.chat(testMessage, 'test-session-add-cart');

    console.log('📋 RESPONSE ANALYSIS:');
    console.log('Response type:', typeof response);
    console.log('Response structure:', Object.keys(response || {}));

    if (response && response.messages) {
      const lastMessage = response.messages[response.messages.length - 1];
      if (lastMessage) {
        console.log('\n💬 Agent Response:');
        console.log(lastMessage.content || lastMessage);

        // Check for tool calls
        if (response.messages.some(msg => msg.tool_calls)) {
          const toolCalls = response.messages
            .filter(msg => msg.tool_calls)
            .flatMap(msg => msg.tool_calls);

          console.log('\n🛠️  TOOL CALLS DETECTED:');
          toolCalls.forEach((call, index) => {
            console.log(`${index + 1}. Tool: ${call.name}`);
            console.log(`   Args: ${JSON.stringify(call.args, null, 2)}`);
          });

          // Check if any checkout tools were called
          const checkoutCalls = toolCalls.filter(
            call =>
              call.name.includes('checkout') || call.name.includes('Checkout'),
          );

          const addCartCalls = toolCalls.filter(
            call =>
              call.name.includes('add_to_cart') ||
              call.name.includes('addToCart'),
          );

          if (checkoutCalls.length > 0) {
            console.log(
              '❌ PROBLEM: Checkout tools were called for add-to-cart request!',
            );
            checkoutCalls.forEach(call => console.log(`   - ${call.name}`));
          }

          if (addCartCalls.length > 0) {
            console.log('✅ CORRECT: Add-to-cart tools were called');
            addCartCalls.forEach(call => console.log(`   - ${call.name}`));
          }

          if (checkoutCalls.length === 0 && addCartCalls.length === 0) {
            console.log('⚠️  WARNING: No cart-related tools were called');
          }
        } else {
          console.log('ℹ️  No tool calls detected in response');
        }
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(
        'Stack trace:',
        error.stack.split('\n').slice(0, 5).join('\n'),
      );
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('TEST COMPLETE');
}

testAddToCartBehavior().catch(console.error);
