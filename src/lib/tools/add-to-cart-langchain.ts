import { DynamicTool } from '@langchain/core/tools';

export const addToCartTool = (userId: string) => new DynamicTool({
  name: 'add_to_cart',
  description: `
    Add an item to the user's shopping cart. Use this tool when users ask to add products to their cart.
    Input should be a JSON string with the following fields:
    - productCode (required): The product code/id (e.g., "banana", "apple", "milk")
    - quantity (optional): Number of items to add (default: 1)

    Example inputs:
    - '{"productCode": "banana", "quantity": 5}' - Add 5 bananas to cart
    - '{"productCode": "apple", "quantity": 1}' - Add 1 apple to cart

    This tool does not require step-up authorization, only basic login.
    Use this tool immediately when users express intent to add items to their cart.
  `,
  func: async (inputString) => {
    try {
      console.log(`[addToCartTool] Called with userId: ${userId}, input: ${inputString}`);
      
      // Parse the input string to get the cart item data
      let input;
      try {
        input = JSON.parse(inputString);
      } catch (parseError) {
        console.error('Error parsing input:', parseError);
        return JSON.stringify({
          success: false,
          error: 'Invalid JSON input. Please provide a valid JSON string.',
        });
      }

      // Transform id to productCode if needed (for backward compatibility with agent)
      if (input.id && !input.productCode) {
        console.log('[addToCartTool] Transforming id to productCode:', input.id);
        input.productCode = input.id;
        delete input.id;
      }

      console.log('[addToCartTool] Input after transformation:', input);

      // Validate required fields - use productCode as expected by the API
      if (!input.productCode && !input.productName) {
        return JSON.stringify({
          success: false,
          error: 'Either productCode or productName is required',
        });
      }

      // Set defaults and add userId
      input.quantity = input.quantity || 1;
      input.userId = userId;

      console.log('[addToCartTool] Adding item to cart:', input);
      
      // Get the access token from environment or session
      // In a real implementation, you would get this from the current user session

      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/add-to-cart`, {
        method: 'POST',
        headers: {
          // 'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Failed to add item to cart: ${result.error || response.statusText}`);
      }

      console.log('[addToCartTool] Item added successfully:', result);
      
      return JSON.stringify({
        success: true,
        message: result.message,
        cartItem: result.cartItem,
        totalItems: result.totalItems,
      });
      
    } catch (error) {
      console.error('[addToCartTool] Error adding item to cart:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});
