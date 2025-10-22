/**
 * Test Authorization Ephemeral Status Messages
 *
 * This test verifies that the "Authorization sent..." message appears
 * in the ephemeral message box when authorization is initiated.
 */

const fetch = require('node-fetch');

async function testAuthorizationEphemeralStatus() {
  console.log('🧪 Testing Authorization Ephemeral Status Messages\n');

  const testCases = [
    {
      name: 'Checkout flow requiring authorization',
      message: 'Buy 2 apples',
      expectedStatus: 'Authorization sent...',
    },
    {
      name: 'Cart checkout requiring authorization',
      message: 'Proceed to checkout',
      expectedStatus: 'Authorization sent...',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Message: "${testCase.message}"`);
    console.log(`   Expected Status: "${testCase.expectedStatus}"\n`);

    try {
      const response = await fetch('http://localhost:3000/api/chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testCase.message,
          conversationId: `auth-test-${Date.now()}`,
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

      let foundAuthSentMessage = false;

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

              // Check if this is the authorization sent message
              if (
                event.payload.text &&
                event.payload.text.includes('Authorization sent')
              ) {
                foundAuthSentMessage = true;
                console.log(`   ✅ Found authorization sent message!`);
              }
            }

            // Log permanent messages
            if (event.type === 'message') {
              console.log(
                `   [MESSAGE] ${event.payload.content?.substring(0, 100) || 'no content'}...`,
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
      console.log(
        `      - Found "Authorization sent..." message: ${foundAuthSentMessage ? '✅' : '❌'}`,
      );

      // Verify authorization-specific checks
      const authorizationEvents = events.status.filter(
        e =>
          e.payload.agent === 'authorization' ||
          (e.payload.text && e.payload.text.includes('Authorization')),
      );
      console.log(
        `      - Authorization status events: ${authorizationEvents.length}`,
      );

      if (foundAuthSentMessage) {
        console.log(`   🎉 Test PASSED: Authorization sent message found`);
      } else {
        console.log(`   ❌ Test FAILED: Authorization sent message not found`);
      }
    } catch (error) {
      console.error(`   ❌ Test failed:`, error.message);
    }
  }

  console.log('\n✨ Authorization ephemeral status testing complete!\n');
}

// Run tests
testAuthorizationEphemeralStatus().catch(console.error);
