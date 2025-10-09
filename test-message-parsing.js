// Test message format that supervisor sends to cart agent
const sampleSupervisorMessage =
  '[userId:google-oauth2|104493120577265537739] User confirmed: "yes". Please add 2 apples to cart using productCode "apple" and userId "google-oauth2|104493120577265537739"';

console.log('🧪 Testing message parsing logic...');
console.log('Sample message from supervisor:');
console.log(sampleSupervisorMessage);
console.log('\n📝 What the cart agent should extract:');

// Simulate what the agent should do
function parseMessage(message) {
  console.log('\nStep 1: Extract userId');
  const userIdMatch = message.match(/\[userId:([^\]]+)\]/);
  const userId = userIdMatch ? userIdMatch[1] : null;
  console.log('  Extracted userId:', userId);

  console.log('\nStep 2: Extract quantity');
  const quantityMatch = message.match(/add (\d+)/);
  const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;
  console.log('  Extracted quantity:', quantity);

  console.log('\nStep 3: Extract productCode');
  const productCodeMatch = message.match(/productCode ["\']([^"\']+)["\']/);
  const productCode = productCodeMatch ? productCodeMatch[1] : null;
  console.log('  Extracted productCode:', productCode);

  console.log('\nStep 4: Create tool input JSON');
  const toolInput = {
    productCode: productCode,
    quantity: quantity,
    userId: userId,
  };
  console.log('  Tool input JSON:', JSON.stringify(toolInput, null, 2));

  return toolInput;
}

const result = parseMessage(sampleSupervisorMessage);

console.log('\n✅ Expected tool call:');
console.log(`add_to_cart('${JSON.stringify(result)}')`);

console.log(
  '\n❌ Current problem: Agent calls with undefined instead of the JSON above',
);
