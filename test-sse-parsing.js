#!/usr/bin/env node

// Simple test to verify SSE parsing logic
// This simulates the problematic SSE data format

function testSSEParsing() {
  console.log('🧪 Testing SSE parsing logic...');

  // Simulate the problematic SSE data from the error logs
  const sseData = `event: values
data: {
data:   "run_id": "0b3616cd-8ce1-42f5-a59e-8fe4356e4ced",
data:   "attempt": 1
data: }
id: 0

event: values
data: {
data:   "messages": [
data:     {
data:       "content": "hello there",
data:       "additional_kwargs": {},
data:       "response_metadata": {},
data:       "id": "2a294da0-dd0d-4b59-816c-800cc3a796af",
data:       "type": "human"
data:     }
data:   ]
data: }
id: 1

event: values
data: {
data:   "messages": [
data:     {
data:       "content": "hello there",
data:       "additional_kwargs": {},
data:       "response_metadata": {},
data:       "id": "2a294da0-dd0d-4b59-816c-800cc3a796af", 
data:       "type": "human"
data:     },
data:     {
data:       "content": "Hello! How can I assist you today with your grocery product discovery?",
data:       "additional_kwargs": {},
data:       "response_metadata": {},
data:       "tool_call_chunks": [],
data:       "id": "chatcmpl-COYeQllIyYgXvllKdFFJpMMQPqPBC",
data:       "tool_calls": [],
data:       "invalid_tool_calls": [],
data:       "type": "ai"
data:     }
data:   ]
data: }
id: 2`;

  // Test the parsing logic
  const lines = sseData.split('\n');
  let messages = [];
  let fullContent = '';
  let jsonBuffer = '';

  console.log(`Processing ${lines.length} lines...`);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('data: ')) {
      // Add this line's JSON data to the buffer
      jsonBuffer += trimmedLine.slice(6); // Remove 'data: ' prefix
    } else if (
      trimmedLine === '' ||
      trimmedLine.startsWith('id:') ||
      trimmedLine.startsWith('event:')
    ) {
      // End of data block, try to parse accumulated JSON
      if (jsonBuffer.trim()) {
        try {
          console.log(
            `Attempting to parse JSON: ${jsonBuffer.substring(0, 100)}...`,
          );
          const data = JSON.parse(jsonBuffer);

          if (data.messages && Array.isArray(data.messages)) {
            messages = data.messages;
            console.log(
              `✅ Successfully parsed ${data.messages.length} messages`,
            );

            // Extract content from AI messages
            for (let i = data.messages.length - 1; i >= 0; i--) {
              const msg = data.messages[i];
              console.log(
                `  Message ${i}: type=${msg?.type}, content="${msg?.content?.substring(0, 50)}..."`,
              );

              if (
                msg &&
                msg.type === 'ai' &&
                msg.content &&
                typeof msg.content === 'string' &&
                msg.content.trim()
              ) {
                fullContent = msg.content;
                console.log(`  ✅ Found AI content: "${msg.content}"`);
                break;
              }
            }
          }
        } catch (e) {
          if (jsonBuffer.length > 5) {
            console.log(`❌ Failed to parse JSON: ${e.message}`);
            console.log(`   JSON buffer: ${jsonBuffer.substring(0, 200)}`);
          }
        }

        jsonBuffer = '';
      }
    }
  }

  console.log('\n📊 Final Results:');
  console.log(`Messages found: ${messages.length}`);
  console.log(`Full content: "${fullContent}"`);
  console.log(`Test ${fullContent ? '✅ PASSED' : '❌ FAILED'}`);
}

testSSEParsing();
