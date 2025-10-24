const http = require('http');

async function testStream() {
  try {
    // First create a thread
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
    console.log('Created thread:', threadId);
    
    // Now stream a message
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
      console.log('\n=== Collecting full stream (waiting 20s) ===\n');
      
      let buffer = '';
      let eventCount = 0;
      let currentEvent = '';
      let dataLines = [];
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            // Process previous event
            if (currentEvent && dataLines.length > 0) {
              try {
                const dataStr = dataLines.join('');
                const data = JSON.parse(dataStr);
                console.log(`\n--- Event ${eventCount++}: ${currentEvent} ---`);
                
                if (data.messages) {
                  console.log(`Messages count: ${data.messages.length}`);
                  const lastMsg = data.messages[data.messages.length - 1];
                  
                  // Show important fields
                  if (lastMsg.message) {
                    const msg = lastMsg.message;
                    console.log('Type:', msg.type);
                    console.log('Content:', msg.content ? msg.content.substring(0, 200) : 'none');
                    if (lastMsg.progress) {
                      console.log('Progress:', lastMsg.progress);
                    }
                  } else {
                    console.log('Message:', JSON.stringify(lastMsg, null, 2));
                  }
                }
              } catch (e) {
                console.error('Parse error:', e.message);
              }
            }
            currentEvent = line.slice(7).trim();
            dataLines = [];
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(6).trim());
          }
        }
      });
      
      res.on('end', () => {
        console.log('\n=== Stream complete ===');
        process.exit(0);
      });
    });
    
    req.on('error', (error) => console.error('Request error:', error));
    
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
setTimeout(() => process.exit(0), 20000);
