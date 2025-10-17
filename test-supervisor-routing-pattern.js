/**
 * Test to verify deals node routes back to supervisor instead of directly to cart
 * This validates the hub-and-spoke pattern implementation
 */

const {compileSupervisorWorkflow} = require('./src/lib/agents/supervisor');
const {MemorySaver} = require('@langchain/langgraph');

async function testSupervisorRoutingPattern() {
  console.log('🧪 TESTING SUPERVISOR ROUTING PATTERN');
  console.log('=====================================\n');

  const checkpointer = new MemorySaver();
  const graph = compileSupervisorWorkflow({checkpointer});

  const config = {
    configurable: {
      thread_id: 'test-supervisor-routing-' + Date.now(),
    },
  };

  // Test complex workflow: "check if there are deals for apples and if there is, add few to my cart"
  const complexWorkflowMessage =
    'check if there are deals for apples and if there is, add few to my cart';

  console.log('📝 Testing Complex Workflow Request:');
  console.log(`User: "${complexWorkflowMessage}"`);
  console.log();

  try {
    const initialState = {
      messages: [{role: 'user', content: complexWorkflowMessage}],
      userId: 'test-user-123',
      conversationId: 'test-conversation-456',
      workflowContext: null,
      dealData: null,
      pendingProduct: null,
      cartData: null,
      next: null,
    };

    console.log('🎯 Step 1: Initial routing to planner...');
    const result1 = await graph.invoke(initialState, config);
    console.log('Next node after initial:', result1.next);
    console.log('Workflow context:', result1.workflowContext);
    console.log();

    if (result1.next === 'deals') {
      console.log('🎯 Step 2: Processing with deals agent...');
      const result2 = await graph.invoke(result1, config);
      console.log('Next node after deals:', result2.next);
      console.log('Workflow context after deals:', result2.workflowContext);
      console.log('Deal data applied:', result2.dealData?.applied);
      console.log();

      if (result2.next === 'supervisor') {
        console.log(
          '✅ SUCCESS: Deals node correctly routes back to supervisor!',
        );
        console.log('🎯 Step 3: Supervisor should now delegate to cart...');

        const result3 = await graph.invoke(result2, config);
        console.log('Next node after supervisor:', result3.next);
        console.log('Final workflow context:', result3.workflowContext);
        console.log();

        if (result3.next === 'cart_and_checkout') {
          console.log(
            '✅ PERFECT: Supervisor correctly delegates to cart_and_checkout!',
          );
          console.log('🏆 Hub-and-spoke pattern working correctly!');
        } else {
          console.log(
            '⚠️  Supervisor routed to:',
            result3.next,
            '(expected: cart_and_checkout)',
          );
        }
      } else {
        console.log(
          '❌ ISSUE: Deals node routed to:',
          result2.next,
          '(expected: supervisor)',
        );
      }
    } else {
      console.log(
        '⚠️  Initial routing went to:',
        result1.next,
        '(expected deals for this test)',
      );
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }

  console.log('\n🔍 ROUTING PATTERN ANALYSIS:');
  console.log('==============================');
  console.log(
    '✅ Standard Pattern: User → Planner → Supervisor → Deals → Supervisor → Cart',
  );
  console.log(
    '❌ Direct Pattern:   User → Planner → Supervisor → Deals → Cart (bypassing supervisor)',
  );
  console.log(
    '\nThis test validates that we use the STANDARD pattern for proper orchestration.',
  );
}

// Run the test
testSupervisorRoutingPattern().catch(console.error);
