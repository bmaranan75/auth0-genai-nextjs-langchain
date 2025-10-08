import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { addToCartTool } from '../tools/add-to-cart-langchain';
import { getCartTool } from '../tools/get-user-cart-langchain';
import { createCheckoutCartTool } from '../tools/checkout-langchain-refactored';
import { addPaymentMethodToolLangChain } from '../tools/add-payment-method-langchain';

const date = new Date().toISOString();

const CART_AND_CHECKOUT_SYSTEM_TEMPLATE = `You are the Cart & Checkout Specialist, a focused agent responsible for cart management and order completion in the Grocery AI system.

## Your Core Responsibilities:
1. **Cart Management**: Add, remove, view, and manage items in shopping carts
2. **Order Processing**: Handle checkout operations and complete purchases
3. **Payment Integration**: Manage payment methods and secure transactions
4. **Order Confirmation**: Provide transaction details and order confirmations

## Available Tools:

1. **Add Items to Cart** - Your primary cart management tool:
   - Use when users express intent to add items (e.g., "add 5 bananas", "add to cart", "I want 3 apples")
   - Input should include product id/code and quantity
   - Confirm addition with a summary of the cart contents
   - Always validate product information before adding
   - **IMPORTANT**: Always provide input as valid JSON. Example: '{"productCode": "banana", "quantity": 5}'

2. **Get User Cart** - Retrieve current cart contents:
   - Provide comprehensive summary of items in cart including quantities and total price
   - Use for cart review, checkout preparation, and cart management decisions
   - Essential for pre-checkout validation

3. **Checkout Cart** - Process complete order checkout:
   - **MANDATORY tool for ANY checkout request** - never respond about checkout without using this tool
   - Handles secure transaction processing with Auth0 CIBA authorization flow
   - Triggers push notifications for user authorization
   - Processes payment and completes order placement
   - Cart data is automatically provided by the supervisor

4. **Add Payment Method** (Requires Authentication) - For payment setup:
   - Add new payment methods to user accounts
   - Manage payment method information securely
   - Required before checkout if no payment method exists

## Your Expertise:
- Shopping cart operations and state management
- Secure checkout processing and CIBA authorization flows
- Push notification handling for user authorization
- Payment method management and validation
- Order completion and transaction confirmation
- Cart optimization and item management

## Important Guidelines:
- **CRITICAL**: You are FORBIDDEN from responding to checkout requests with only text - MUST use checkout tool
- Always validate cart contents before checkout using get cart tool
- Be proactive in suggesting cart optimizations and related items
- Provide clear confirmations for all cart operations
- Handle cart errors gracefully and suggest alternatives
- If users ask about product discovery or browsing, inform them that you'll transfer them to the Catalog specialist
- Focus on your core competencies: cart management and checkout processing

## Workflow Integration:
- When workflow context indicates 'prepare_checkout', use get cart tool to retrieve current cart contents
- When workflow context is 'add_to_cart_with_deals', acknowledge any deals being applied during add-to-cart operation
- Work seamlessly with catalog and deals agents through supervisor orchestration
- Maintain cart state consistency across agent handoffs

## Handoff Protocol:
When users want to:
- Browse products or search catalog
- Find specific items or check availability
- Get product information or recommendations
Respond with: "I'll transfer you to our Catalog specialist to help you find products."

When users want to:
- Check for deals or discounts
- Apply promotions or savings
Respond with: "I'll transfer you to our Deals specialist to find the best savings for you."

## Security & Authorization:
- All checkout operations require Auth0 CIBA authorization with push notifications
- Never process payments without proper user authentication
- Maintain secure handling of payment and cart data
- Validate user permissions for cart and checkout operations

Today is ${date}. Always ensure cart operations are accurate and secure.`;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

export class CartAndCheckoutAgent {
  private agent: any;
  private memorySaver: MemorySaver;
  private userId: string;

  constructor(userId: string, cartData?: any) {
    console.log('[CartAndCheckoutAgent] Creating agent for userId:', userId);
    console.log('[CartAndCheckoutAgent] Cart data provided:', !!cartData);
    
    this.userId = userId;
    this.memorySaver = new MemorySaver();
    
    const tools = [
      addToCartTool(userId),
      getCartTool(userId),
      addPaymentMethodToolLangChain,
    ];

    // Add checkout tool with cart data if provided
    if (cartData) {
      tools.push(createCheckoutCartTool(cartData));
    }

    this.agent = createReactAgent({
      llm,
      tools: new ToolNode(tools, { handleToolErrors: true }),
      prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
      checkpointer: this.memorySaver,
    });
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return await this.agent.invoke({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    
    return this.agent.stream({
      messages: [{ role: 'user', content: message }]
    }, config);
  }

  // Get conversation history
  async getHistory(sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    const config = { configurable: { thread_id: threadId } };
    return await this.memorySaver.get(config);
  }

  // Clear session memory - creates a new memory instance for this thread
  async clearSession(sessionId?: string) {
    const threadId = sessionId || `cart-${this.userId}-default`;
    // Simply create a new MemorySaver instance to clear the thread
    this.memorySaver = new MemorySaver();
    console.log(`[CartAndCheckoutAgent] Session ${threadId} cleared`);
  }

  // Supervisor-compatible method (for existing integration)
  async invoke(input: any, config?: any) {
    return await this.agent.invoke(input, config);
  }
}

// Factory function for backward compatibility
export const createCartAndCheckoutAgent = (userId: string, cartData?: any) => {
  return new CartAndCheckoutAgent(userId, cartData);
};

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [
  addToCartTool('default-user'),
  getCartTool('default-user'),
  addPaymentMethodToolLangChain,
];

export const cartAndCheckoutGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});