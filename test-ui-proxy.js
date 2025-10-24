/**
 * Test the UI proxy endpoint to verify SSE transformation
 */

const http = require('http');

async function testUIProxy() {
  console.log('Testing UI proxy at http://localhost:3000/api/chat');
  console.log('Sending message: "hello"\n');
  
  const postData = JSON.stringify({
    messages: [
      { role: 'user', content: 'hello' }
    ]
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'text/event-stream'
    }
  };
  
  const req = http.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('\n=== SSE Events (first 40 lines) ===\n');
    
    let lineCount = 0;
    let buffer = '';
    
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (lineCount++ < 40) {
          console.log(line);
        } else {
          req.destroy();
          return;
        }
      }
    });
    
    res.on('end', () => {
      console.log('\n=== Stream ended ===');
      process.exit(0);
    });
  });
  
  req.on('error', (error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
  
  req.write(postData);
  req.end();
  
  // Timeout after 15 seconds
  setTimeout(() => {
    console.log('\n=== Timeout reached ===');
    req.destroy();
    process.exit(0);
  }, 15000);
}

testUIProxy();
