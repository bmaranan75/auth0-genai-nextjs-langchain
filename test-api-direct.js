// Test the add-to-cart API endpoint directly
const http = require('http');

async function testAddToCartAPI() {
  console.log('🧪 Testing add-to-cart API endpoint...');

  const testCases = [
    {
      name: 'Valid request with apples',
      data: {
        productCode: 'apples',
        quantity: 2,
        userId: 'test-user-123',
      },
    },
    {
      name: 'Valid request with apple (singular)',
      data: {
        productCode: 'apple',
        quantity: 1,
        userId: 'test-user-123',
      },
    },
    {
      name: 'Valid request with bananas',
      data: {
        productCode: 'bananas',
        quantity: 5,
        userId: 'test-user-123',
      },
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n✅ Testing: ${testCase.name}`);

    const postData = JSON.stringify(testCase.data);

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/add-to-cart',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.request(options, res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => resolve({status: res.statusCode, data: data}));
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      console.log(`Status: ${response.status}`);
      console.log(`Response:`, response.data);
    } catch (error) {
      console.error(`Error:`, error.message);
    }
  }
}

testAddToCartAPI().catch(console.error);
