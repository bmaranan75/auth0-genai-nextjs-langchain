// Test the new structured addToCartTool
const {
  addToCartTool,
} = require('./src/lib/tools/add-to-cart-langchain-structured.ts');

async function testStructuredTool() {
  console.log('🧪 Testing structured addToCartTool...');

  const tool = addToCartTool('test-user');

  console.log('📋 Tool info:');
  console.log('Name:', tool.name);
  console.log('Schema:', tool.schema.shape);

  // Test 1: Proper structured input
  console.log('\n✅ Test 1: Proper structured input');
  try {
    const result1 = await tool.func({
      productCode: 'apple',
      quantity: 2,
      userId: 'test-user-123',
    });
    console.log('Result:', result1);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: Missing productCode
  console.log('\n❌ Test 2: Missing productCode');
  try {
    const result2 = await tool.func({
      quantity: 1,
      userId: 'test-user-123',
    });
    console.log('Result:', result2);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 3: Missing userId
  console.log('\n❌ Test 3: Missing userId');
  try {
    const result3 = await tool.func({
      productCode: 'banana',
      quantity: 3,
    });
    console.log('Result:', result3);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testStructuredTool().catch(console.error);
