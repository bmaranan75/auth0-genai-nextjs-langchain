#!/usr/bin/env node

/**
 * Simple MCP Server Test Client
 * Tests your MCP server by calling tools directly
 */

const https = require('https');
const http = require('http');

// Configuration
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!MCP_API_KEY) {
  console.error('❌ Error: MCP_API_KEY not set in environment');
  console.error('Run: export $(grep MCP_API_KEY .env.local | xargs)');
  process.exit(1);
}

// Test cases
const tests = [
  {
    name: 'Search Products (Catalog Agent)',
    endpoint: '/api/mcp/agents/catalog',
    data: { action: 'search', query: 'milk', limit: 3 }
  },
  {
    name: 'View Cart (Cart Agent)',
    endpoint: '/api/mcp/agents/cart',
    data: { action: 'view' }
  },
  {
    name: 'Get Deals (Deals Agent)',
    endpoint: '/api/mcp/agents/deals',
    data: { action: 'get' }
  }
];

// HTTP request helper
function makeRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, NEXTJS_URL);
    const postData = JSON.stringify(data);

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-MCP-API-Key': MCP_API_KEY
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

// Extract AI response from result
function extractResponse(result) {
  if (result.messages && Array.isArray(result.messages)) {
    const lastMessage = result.messages[result.messages.length - 1];
    if (lastMessage?.kwargs?.content) {
      return lastMessage.kwargs.content;
    }
  }
  return JSON.stringify(result, null, 2);
}

// Run tests
async function runTests() {
  console.log('================================================');
  console.log('🧪 MCP Server Test Client');
  console.log('================================================');
  console.log('');
  console.log(`Next.js URL: ${NEXTJS_URL}`);
  console.log(`API Key: ${MCP_API_KEY.substring(0, 10)}...`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`📝 Test: ${test.name}`);
    console.log(`   Endpoint: ${test.endpoint}`);
    console.log(`   Request: ${JSON.stringify(test.data)}`);
    console.log('');

    try {
      const result = await makeRequest(test.endpoint, test.data);

      if (result.status === 200) {
        console.log(`   ✅ Status: ${result.status} OK`);
        console.log('   📤 Response:');
        const response = extractResponse(result.data);
        console.log(`   ${response.substring(0, 200)}${response.length > 200 ? '...' : ''}`);
        passed++;
      } else {
        console.log(`   ❌ Status: ${result.status}`);
        console.log(`   Error: ${JSON.stringify(result.data).substring(0, 200)}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }

    console.log('');
    console.log('─'.repeat(60));
    console.log('');
  }

  console.log('================================================');
  console.log('Test Summary');
  console.log('================================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${tests.length}`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All tests passed! Your MCP implementation is working!');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }
}

// Check if Next.js is running
http.get(NEXTJS_URL, (res) => {
  console.log('✅ Next.js is running\n');
  runTests();
}).on('error', (e) => {
  console.error('❌ Error: Next.js is not running');
  console.error('Please start Next.js first: npm run dev');
  process.exit(1);
});
