#!/usr/bin/env node
/**
 * Test script to validate deal continuity fix in the supervisor
 */

const {SupervisorAgent} = require('./src/lib/agents/supervisor.ts');

async function testDealContinuity() {
  console.log('🧪 Testing deal continuity fix...');

  try {
    const userId = 'test-user-123';
    const conversationId = 'test-conv-456';
    const supervisor = new SupervisorAgent(userId, conversationId);

    console.log('\n📤 Step 1: User wants to add bananas to cart');
    const step1Result = await supervisor.chat(
      'I want to add 5 bananas to my cart',
      conversationId,
    );

    console.log('📊 Step 1 Result:');
    console.log('- Messages:', step1Result.messages?.length || 0);
    console.log('- Workflow Context:', step1Result.workflowContext);
    console.log('- Deal Data:', !!step1Result.dealData);
    console.log('- Pending Product:', !!step1Result.pendingProduct);

    // Simulate a deal offer response
    if (step1Result.workflowContext === 'awaiting_deal_confirmation') {
      console.log('\n📤 Step 2: User confirms deal with "yes"');
      const step2Result = await supervisor.chat('yes', conversationId);

      console.log('📊 Step 2 Result:');
      console.log('- Next Agent:', step2Result.next);
      console.log('- Workflow Context:', step2Result.workflowContext);
      console.log('- Messages:', step2Result.messages?.length || 0);

      if (
        step2Result.next === 'cart_and_checkout' ||
        step2Result.next === 'END'
      ) {
        console.log('✅ Deal continuity working correctly!');
        return true;
      } else {
        console.log(
          `❌ Deal continuity failed - routed to: ${step2Result.next}`,
        );
        return false;
      }
    } else {
      console.log('ℹ️ No deal confirmation scenario triggered');
      return true;
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testDealContinuity().then(success => {
  process.exit(success ? 0 : 1);
});
