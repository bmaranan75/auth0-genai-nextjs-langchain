// Test script to simulate the browse catalog tool behavior
async function testBrowseCatalog() {
  try {
    console.log('Testing browse catalog tool...');

    // This is exactly what the browse catalog tool does
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    console.log('Base URL:', baseUrl);

    const params = new URLSearchParams();
    const url = `${baseUrl}/api/catalog?${params.toString()}`;
    console.log('Full URL:', url);

    const response = await fetch(url);
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      console.error('Response not ok, status:', response.status);
      console.error('Response text:', await response.text());
      return;
    }

    const result = await response.json();
    console.log('Success! Got', result.products.length, 'products');
    console.log('First product:', result.products[0]);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testBrowseCatalog();
