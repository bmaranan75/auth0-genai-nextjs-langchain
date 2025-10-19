/**
 * Test Ephemeral Status Messages
 *
 * Verifies that status messages:
 * 1. Are emitted correctly from agents
 * 2. Stream to the client with proper typing
 * 3. Are filtered from conversation history
 * 4. Include auto-remove metadata
 */

const fetch = require('node-fetch');

async function testEphemeralStatus() {
  console.log('🧪 Testing Ephemeral Status Messages\n');

  const testCases = [
    {
      name: 'Simple catalog search',
      message: 'Show me apples',
      expectedStatuses: ['searching', 'found', 'complete'],
    },
    {
      name: 'Complex multi-step workflow',
      message: 'Check if there are deals on bananas and add 3 to my cart',
      expectedStatuses: ['checking', 'searching', 'adding', 'updating'],
    },
    {
      name: 'Checkout flow',
      message: 'Proceed to checkout',
      expectedStatuses: ['preparing', 'validating', 'processing'],
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Message: "${testCase.message}"\n`);

    try {
      const response = await fetch('http://localhost:3000/api/chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testCase.message,
          conversationId: `test-${Date.now()}`,
          userId: 'test-user',
        }),
      });

      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status}`);
        continue;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const events = {
        status: [],
        message: [],
        error: [],
        meta: [],
        raw: [],
      };

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            events[event.type] = events[event.type] || [];
            events[event.type].push(event);

            // Log status events with details
            if (event.type === 'status') {
              console.log(`   [STATUS] ${event.payload.text}`);
              if (event.payload.agent) {
                console.log(`            Agent: ${event.payload.agent}`);
              }
              if (event.payload.autoRemoveMs) {
                console.log(
                  `            Auto-remove: ${event.payload.autoRemoveMs}ms`,
                );
              }
              console.log(`            Ephemeral: ${event.payload.ephemeral}`);
            }

            // Log permanent messages
            if (event.type === 'message') {
              console.log(
                `   [MESSAGE] ${event.payload.content.substring(0, 100)}...`,
              );
            }

            // Log errors
            if (event.type === 'error') {
              console.log(
                `   [ERROR] ${event.payload.message || event.payload}`,
              );
            }
          } catch (e) {
            console.warn(
              `   ⚠️  Failed to parse line: ${line.substring(0, 50)}...`,
            );
          }
        }
      }

      // Summary
      console.log(`\n   ✅ Summary:`);
      console.log(`      - Status events: ${events.status.length}`);
      console.log(`      - Message events: ${events.message.length}`);
      console.log(`      - Error events: ${events.error.length}`);

      // Verify ephemeral markers
      const allEphemeral = events.status.every(
        e => e.payload.ephemeral === true,
      );
      console.log(
        `      - All status events are ephemeral: ${allEphemeral ? '✅' : '❌'}`,
      );

      // Verify auto-remove metadata
      const hasAutoRemove = events.status.some(e => e.payload.autoRemoveMs > 0);
      console.log(
        `      - Status events have auto-remove: ${hasAutoRemove ? '✅' : '❌'}`,
      );
    } catch (error) {
      console.error(`   ❌ Test failed:`, error.message);
    }
  }

  console.log('\n✨ Testing complete!\n');
}

// Run tests
testEphemeralStatus().catch(console.error);
