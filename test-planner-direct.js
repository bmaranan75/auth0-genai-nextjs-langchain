// Test the planner directly to see what it outputs
const {planner} = require('./src/lib/agents/planner.ts');

async function testPlanner() {
  console.log('🧪 Testing planner directly...');

  const testCases = [
    {
      name: 'Simple greeting (should direct response)',
      message: 'Hello',
    },
    {
      name: 'Product search (should delegate to catalog)',
      message: 'Find organic apples',
    },
    {
      name: 'Deals inquiry (should delegate to deals)',
      message: 'What deals are available today?',
    },
    {
      name: 'Cart action (should delegate to cart_and_checkout)',
      message: 'Add bananas to my cart',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n✅ Testing: ${testCase.name}`);
    console.log(`Input: "${testCase.message}"`);

    try {
      const state = {
        messages: [
          {
            message: {
              content: testCase.message,
              role: 'user',
            },
            role: 'user',
            timestamp: Date.now(),
          },
        ],
      };

      const result = await planner(state);
      console.log('Planner result:', JSON.stringify(result, null, 2));

      // Check the tool call
      const lastMsg = result.messages[0];
      if (lastMsg.message.tool_calls && lastMsg.message.tool_calls.length > 0) {
        const toolCall = lastMsg.message.tool_calls[0];
        console.log(`Tool: ${toolCall.name}`);
        console.log(`Args:`, toolCall.args);
      }

      if (lastMsg.delegation) {
        console.log(`Delegation info:`, lastMsg.delegation);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

testPlanner().catch(console.error);
