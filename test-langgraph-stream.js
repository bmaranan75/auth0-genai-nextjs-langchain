const https = require('http');

async function testStream() {
  try {
    // First create a thread
    const threadData = await new Promise((resolve, reject) => {
      const req = https.request({
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
    const req = https.request({
      hostname: 'localhost',
      port: 2024,
      path: `/threads/${threadId}/runs/stream`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }
    }, (res) => {
      console.log('\n=== Response Status:', res.statusCode);
      console.log('=== Response Headers:', res.headers);
      console.log('\n=== Stream events:');
      
      let buffer = '';
      let count = 0;
      
      res.on('data', (chunk) => {
        if (count++ > 30) {
          req.destroy();
          return;
        }
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.trim()) {
            console.log(line);
          }
        });
      });
      
      res.on('end', () => console.log('\n=== Stream ended'));
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
