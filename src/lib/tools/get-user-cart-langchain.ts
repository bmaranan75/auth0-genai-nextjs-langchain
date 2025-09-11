import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

const getCartSchema = z.object({
  // No parameters needed - userId is provided at tool creation time
});

export const getCartTool =  (userId: string) => new DynamicStructuredTool({
  name: 'get_cart',
  description: 'Get the current cart contents for the authenticated user',
  schema: getCartSchema,
  func: async () => {
    console.log(`[getCartTool] Called with userId: ${userId}`);
    try {
      const baseUrl = process.env.NEXTJS_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/get-cart?userId=${encodeURIComponent(userId)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get cart');
      }
      
      return JSON.stringify({
        success: true,
        cart: data.cart,
        message: data.message || 'Cart retrieved successfully',
      });
    } catch (error) {
      console.error('Error getting cart:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});

// export const getUserCartTool = getCartTool('');