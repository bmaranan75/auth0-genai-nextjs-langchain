/**
 * Detailed error test - captures full error information
 */

async function testWithDetails() {
  console.log('🔍 Testing with detailed error capture...\n');

  const conversationId = `test-${Date.now()}`;
  const testMessage = "Hello";

  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: testMessage }],
        conversationId: conversationId
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n✅ Stream ended normally');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventType = line.substring(7).trim();
          eventCount++;
          console.log(`\n[Event ${eventCount}] Type: ${eventType}`);
        } else if (line.startsWith('data:')) {
          const data = line.substring(6);
          console.log(`  Data: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
          
          // Try to parse JSON and look for errors
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.log('\n❌ ERROR FOUND:', parsed.error);
              console.log('   Message:', parsed.message);
              return;
            }
          } catch (e) {
            // Not complete JSON yet
          }
        }
      }

      if (eventCount >= 10) {
        console.log('\n... (stopping after 10 events)');
        break;
      }
    }

    console.log(`\nTotal events: ${eventCount}`);

  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    console.log('Stack:', error.stack);
  }
}

testWithDetails().catch(console.error);
