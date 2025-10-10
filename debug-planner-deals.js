// Test to debug planner routing for deals requests

console.log('🧪 TESTING PLANNER DEALS ROUTING');
console.log('='.repeat(50));

const testRequest = 'can you check some deals for milk?';

console.log(`📝 Test Request: "${testRequest}"`);

console.log('\n🔍 ANALYSIS:');
console.log('   Expected behavior:');
console.log('   1. Planner should detect this as a deals-related request');
console.log('   2. Should use delegate_to_agent tool with agent="deals"');
console.log('   3. Should route to deals specialist');

console.log('\n❌ ACTUAL BEHAVIOR (reported):');
console.log('   Planner responds with generic greeting instead of routing');
console.log(
  '   "I\'m your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?"',
);

console.log('\n🤔 POSSIBLE CAUSES:');
console.log('   1. Planner not recognizing "check deals" pattern');
console.log('   2. Using direct_response instead of delegate_to_agent tool');
console.log('   3. Tool calling configuration issue');
console.log('   4. System prompt needs better deals examples');

console.log('\n📋 PLANNER PROMPT ANALYSIS:');
console.log('   ✅ Deals agent mentioned in capabilities');
console.log('   ✅ delegate_to_agent tool has "deals" in enum');
console.log('   ❓ Missing explicit "check deals" example in prompt');

console.log('\n🔧 POTENTIAL FIXES:');
console.log('   1. Add explicit deals examples in planner prompt');
console.log('   2. Check if tool_choice is working correctly');
console.log('   3. Verify planner is actually calling tools');
console.log('   4. Test with more explicit deals keywords');

console.log('\n🧪 TEST VARIATIONS TO TRY:');
const testVariations = [
  'check deals for milk',
  'find deals on milk',
  'what deals are available for milk?',
  'show me milk promotions',
  'are there any discounts on milk?',
];

testVariations.forEach((variation, index) => {
  console.log(`   ${index + 1}. "${variation}"`);
});

console.log('\n' + '='.repeat(50));
