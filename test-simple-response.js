const http = require('http');

async function testStream() {
  try {
    const threadData = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 2024,
        path: '/threads',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ metadata: { test: true } }));
      req.end();
    });
    
    const threadId = threadData.thread_id;
    console.log('Created thread:', threadId, '\n');
    
    const req = http.request({
      hostname: 'localhost',
      port: 2024,
      path: `/threads/${threadId}/runs/stream`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }
    }, (res) => {
      let buffer = '';
      let eventCount = 0;
      let currentEvent = '';
      let dataLines = [];
      let lastAIMessage = null;
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            if (currentEvent && dataLines.length > 0) {
              try {
                const dataStr = dataLines.join('');
                const data = JSON.parse(dataStr);
                
                if (data.messages) {
                  const lastMsg = data.messages[data.messages.length - 1];
                  if (lastMsg.message?.type === 'ai') {
                    lastAIMessage = lastMsg;
                    console.log(`Event ${eventCount++}: AI Message from ${lastMsg.agent || 'unknown'}`);
                    console.log('Content:', lastMsg.message.content.substring(0, 150));
                    if (lastMsg.progress) console.log('Progress:', lastMsg.progress.isProgressUpdate);
                    console.log('');
                  }
                }
              } catch (e) {}
            }
            currentEvent = line.slice(7).trim();
            dataLines = [];
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(6).trim());
          }
        }
      });
      
      res.on('end', () => {
        console.log('\n=== Final AI Message ===');
        if (lastAIMessage) {
          console.log('Agent:', lastAIMessage.agent);
          console.log('Content:', lastAIMessage.message.content);
          console.log('Is Progress:', !!lastAIMessage.progress);
        } else {
          console.log('No AI message received');
        }
        process.exit(0);
      });
    });
    
    req.on('error', (error) => console.error('Error:', error));
    
    // Try a direct response that doesn't need delegation
    req.write(JSON.stringify({
      assistant_id: 'supervisor',
      input: {
        messages: [{ role: 'human', content: 'what can you help me with?' }]
      },
      stream_mode: 'values'
    }));
    req.end();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testStream();
setTimeout(() => process.exit(0), 20000);
