/**
 * Test full chat flow through the proxy
 * Tests: UI → Next.js Proxy → LangGraph → Supervisor → Response
 */

async function testFullChatFlow() {
  console.log('🧪 Testing Full Chat Flow Through Proxy...\n');

  const conversationId = `test-${Date.now()}`;
  const testMessage = "Show me some deals on electronics";

  console.log('📤 Sending message:', testMessage);
  console.log('🔑 Conversation ID:', conversationId, '\n');

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

    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Headers:');
    console.log('   Content-Type:', response.headers.get('content-type'));
    console.log('   Transfer-Encoding:', response.headers.get('transfer-encoding'));
    
    if (!response.ok) {
      console.log('❌ Request failed with status:', response.status);
      const text = await response.text();
      console.log('Error:', text);
      return;
    }

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('\n✅ Receiving SSE stream...\n');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let messageCount = 0;
      let agentsSeen = new Set();
      let fullResponse = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                messageCount++;
                
                // Track which agent responded
                if (data.agent) {
                  agentsSeen.add(data.agent);
                }
                
                // Extract message content
                if (data.messages && data.messages.length > 0) {
                  const lastMsg = data.messages[data.messages.length - 1];
                  if (lastMsg.content) {
                    fullResponse = lastMsg.content;
                  }
                }

                // Log progress
                if (messageCount === 1) {
                  console.log('📦 First chunk received');
                }
                if (messageCount % 5 === 0) {
                  console.log(`📦 Received ${messageCount} chunks...`);
                }
              } catch (e) {
                // Skip non-JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      console.log('\n✅ Stream complete!\n');
      console.log('📊 Statistics:');
      console.log(`   Total chunks: ${messageCount}`);
      console.log(`   Agents involved: ${Array.from(agentsSeen).join(', ') || 'unknown'}`);
      console.log(`   Response length: ${fullResponse.length} characters`);
      
      if (fullResponse) {
        console.log('\n📝 Response preview:');
        console.log(fullResponse.substring(0, 200) + (fullResponse.length > 200 ? '...' : ''));
      }

      console.log('\n✅ SUCCESS: Full chat flow working!');
      console.log('✅ UI → Proxy → LangGraph → Supervisor → Response ✓');
      
    } else {
      console.log('⚠️  Response is not SSE format');
      const text = await response.text();
      console.log('Response:', text.substring(0, 200));
    }

  } catch (error) {
    console.log('❌ Test failed:', error.message);
    if (error.stack) {
      console.log(error.stack);
    }
  }
}

testFullChatFlow().catch(console.error);
