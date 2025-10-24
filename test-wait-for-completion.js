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
    console.log('Thread:', threadId);
    console.log('Waiting for COMPLETE stream...\n');
    
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
      let allEvents = [];
      let buffer = '';
      let currentEvent = '';
      let dataLines = [];
      
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
                allEvents.push({ event: currentEvent, data });
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
        console.log(`\nTotal events: ${allEvents.length}\n`);
        
        allEvents.forEach((evt, idx) => {
          console.log(`Event ${idx + 1}: ${evt.event}`);
          if (evt.data.messages) {
            const lastMsg = evt.data.messages[evt.data.messages.length - 1];
            if (lastMsg.message) {
              console.log(`  Agent: ${lastMsg.agent || 'unknown'}`);
              console.log(`  Type: ${lastMsg.message.type}`);
              const content = lastMsg.message.content || '';
              console.log(`  Content: ${typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100)}`);
              if (lastMsg.progress) console.log(`  Progress: true`);
            }
          }
          console.log('');
        });
        
        process.exit(0);
      });
    });
    
    req.on('error', (error) => console.error('Error:', error));
    
    req.write(JSON.stringify({
      assistant_id: 'supervisor',
      input: {
        messages: [{ role: 'human', content: 'hello' }]
      },
      stream_mode: 'values'
    }));
    req.end();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testStream();
setTimeout(() => {
  console.log('\n=== Timeout - no more events ===');
  process.exit(0);
}, 30000);
