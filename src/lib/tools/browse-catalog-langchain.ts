import { DynamicTool } from '@langchain/core/tools';

export const browseCatalogTool = new DynamicTool({
  name: 'browse_catalog',

  description: `
    Browse and search the product catalog. This tool helps users discover products before adding them to cart.
    Input should be a JSON string with optional fields:
    - search (optional): Search term to find products by id or category
    - category (optional): Filter by specific category (e.g., "Produce", "Dairy", "Seafood")
    - limit (optional): Number of products to return (default: 10, max: 20)
    - offset (optional): Number of products to skip for pagination (default: 0)
    
    Example inputs:
    - '{}' - Get all products
    - '{"search": "apples"}' - Search for apples
    - '{"category": "Produce"}' - Get produce products
    - '{"search": "apples", "limit": 5}' - Search for apples, limit to 5 results

    This tool does not require authentication and can be used to help users discover products.
  `,
  func: async (inputString) => {
    try {
      // Parse the input string
      let input;
      try {
        input = JSON.parse(inputString);
      } catch (parseError) {
        return JSON.stringify({
          success: false,
          error: 'Invalid JSON input. Please provide a valid JSON string.',
        });
      }

      console.log('[browseCatalogTool] Browsing catalog with filters:', input);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (input.search) params.append('search', input.search);
      if (input.category) params.append('category', input.category);
      if (input.limit) params.append('limit', String(input.limit));
      if (input.offset) params.append('offset', String(input.offset));

      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/catalog?${params.toString()}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Failed to browse catalog: ${result.error || response.statusText}`);
      }

      console.log(`[browseCatalogTool] Found ${result.products.length} products`);
      
      // Format the response for better readability - SIMPLIFIED VERSION
      const formattedProducts = result.products.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: `$${product.price}`,
        category: product.category,
        inStock: product.inStock,
        description: product.description
      }));

      return JSON.stringify({
        success: true,
        message: `Found ${result.products.length} products${input.search ? ` matching "${input.search}"` : ''}${input.category ? ` in ${input.category} category` : ''}. Here are the products available:`,
        products: formattedProducts,
        totalProducts: result.pagination.total,
        completed: true // Add a completion flag
      });

    } catch (error) {
      console.error('[browseCatalogTool] Error browsing catalog:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});
