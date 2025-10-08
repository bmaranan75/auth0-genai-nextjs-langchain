import { DynamicTool } from '@langchain/core/tools';
import { parseCartInput, formatToolResponse, logToolExecution } from './robust-tool-parser';

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
    const startTime = Date.now();
    
    try {
      console.log(`[addToCartTool] Called with userId: ${userId}, input: ${inputString}`);
      
      // Use robust parser for input handling
      const parseResult = parseCartInput(inputString);
      
      if (!parseResult.success) {
        return formatToolResponse(false, null, parseResult.error);
      }
      
      let input = parseResult.data;
      
      // Handle empty input
      if (!input.productCode && !input.productName) {
        return formatToolResponse(false, null, 'No product specified to add to cart.');
      }

      // Transform id to productCode if needed (for backward compatibility with agent)
      if (input.id && !input.productCode) {
        console.log('[addToCartTool] Transforming id to productCode:', input.id);
        input.productCode = input.id;
        delete input.id;
      }

      console.log('[addToCartTool] Input after transformation:', input);

      // Additional validation after parsing
      if (!input.productCode && !input.productName) {
        return formatToolResponse(false, null, 'Either productCode or productName is required');
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
      
      const toolResult = {
        message: result.message,
        cartItem: result.cartItem,
        totalItems: result.totalItems,
      };

      const duration = Date.now() - startTime;
      logToolExecution('addToCartTool', inputString, { success: true }, duration);
      
      return formatToolResponse(true, toolResult);
      
    } catch (error) {
      console.error('[addToCartTool] Error adding item to cart:', error);
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logToolExecution('addToCartTool', inputString, { success: false, error: errorMessage }, duration);
      
      return formatToolResponse(false, null, errorMessage);
    }
  },
});
