/**
 * Debug SSE stream format from LangGraph
 */

async function debugSSEStream() {
  console.log('🔍 Debugging SSE Stream Format...\n');

  const conversationId = `debug-${Date.now()}`;
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

    if (!response.ok) {
      console.log('❌ Request failed:', response.status);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    console.log('📦 Raw chunks:\n');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('\n✅ Stream ended');
        break;
      }

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      console.log(`--- Chunk ${chunkCount} ---`);
      console.log(chunk.substring(0, 500));
      console.log('---\n');

      if (chunkCount >= 5) {
        console.log('... (stopping after 5 chunks for analysis)');
        break;
      }
    }

    console.log(`\nTotal chunks received: ${chunkCount}`);
    console.log(`Buffer length: ${buffer.length}`);

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

debugSSEStream().catch(console.error);
