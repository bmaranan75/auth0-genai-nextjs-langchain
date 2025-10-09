// Test the tool calling mechanism without full LangGraph server
const {addToCartTool} = require('./src/lib/tools/add-to-cart-langchain.ts');

async function testToolCalling() {
  console.log('🧪 Testing addToCartTool...');

  const tool = addToCartTool('test-user');

  // Test 1: Proper JSON input
  console.log('\n✅ Test 1: Proper JSON input');
  try {
    const result1 = await tool.call(
      '{"productCode": "apple", "quantity": 2, "userId": "test-user-123"}',
    );
    console.log('Result:', result1);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: Undefined input
  console.log('\n❌ Test 2: Undefined input');
  try {
    const result2 = await tool.call(undefined);
    console.log('Result:', result2);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 3: Empty string input
  console.log('\n❌ Test 3: Empty string input');
  try {
    const result3 = await tool.call('');
    console.log('Result:', result3);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 4: Invalid JSON
  console.log('\n❌ Test 4: Invalid JSON');
  try {
    const result4 = await tool.call('not json');
    console.log('Result:', result4);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testToolCalling().catch(console.error);
