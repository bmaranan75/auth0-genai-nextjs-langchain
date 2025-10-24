/**
 * Pre-Migration Test: Verify current setup works
 * 
 * This script tests the current hybrid architecture to ensure
 * everything is working before we migrate to full separation.
 */

import { createAgent } from './src/lib/multi-agent.js';

async function testCurrentSetup() {
  console.log('🧪 Testing Current Hybrid Architecture...\n');
  
  const testUserId = 'test-user-migration';
  const testConversationId = 'test-conv-migration-' + Date.now();
  
  console.log(`   User ID: ${testUserId}`);
  console.log(`   Conversation ID: ${testConversationId}\n`);
  
  try {
    // Create agent (currently local supervisor + remote specialized agents)
    console.log('1️⃣  Creating agent instance...');
    const agent = createAgent(testUserId, testConversationId);
    console.log('   ✅ Agent created successfully\n');
    
    // Test basic query
    console.log('2️⃣  Testing basic query: "Hello"');
    const startTime = Date.now();
    
    let messageCount = 0;
    const stream = await agent.stream('Hello', testConversationId);
    
    console.log('   📡 Streaming response...');
    
    for await (const chunk of stream) {
      messageCount++;
      // Just count chunks, don't print all of them
      if (messageCount === 1) {
        console.log('   ✅ Received first chunk');
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`   ✅ Response completed (${messageCount} chunks, ${duration}ms)\n`);
    
    // Test product search
    console.log('3️⃣  Testing product search: "Find apples"');
    const searchStartTime = Date.now();
    
    let searchMessageCount = 0;
    const searchStream = await agent.stream('Find apples', testConversationId);
    
    console.log('   📡 Streaming response...');
    
    for await (const chunk of searchStream) {
      searchMessageCount++;
      if (searchMessageCount === 1) {
        console.log('   ✅ Received first chunk');
      }
    }
    
    const searchDuration = Date.now() - searchStartTime;
    console.log(`   ✅ Response completed (${searchMessageCount} chunks, ${searchDuration}ms)\n`);
    
    // Summary
    console.log('=' .repeat(50));
    console.log('✅ All tests passed! Current setup is working correctly.\n');
    console.log('📊 Results:');
    console.log(`   • Greeting query: ${messageCount} chunks in ${duration}ms`);
    console.log(`   • Product search: ${searchMessageCount} chunks in ${searchDuration}ms`);
    console.log('\n🚀 Ready to proceed with Step 2: Create Thin Proxy\n');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n⚠️  Current setup has issues. Fix these before proceeding:\n');
    console.error(error);
    return false;
  }
}

// Run test
testCurrentSetup()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
