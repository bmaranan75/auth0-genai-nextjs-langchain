import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';
import { addToCartTool } from '../tools/add-to-cart-langchain-structured';
import { getCartTool } from '../tools/get-user-cart-langchain';
import { createCheckoutCartTool, authorizedTracedCheckoutCartTool } from '../tools/checkout-langchain-refactored';
import { withAsyncAuthorization } from '../auth0-ai-langchain';

const date = new Date().toISOString();

const CART_AND_CHECKOUT_SYSTEM_TEMPLATE = `You are the Cart & Checkout Specialist for the Grocery AI system.

## Your Role
Manage shopping carts and process orders through secure checkout operations.

## Core Responsibilities  
• **Cart Management**: Add items, view cart contents, manage quantities
• **Order Processing**: Handle checkout when explicitly requested
• **Deal Continuity**: Process structured messages from other agents (deals, supervisor)
• **User Authentication**: Process CIBA authorization for secure operations

## Tool Usage Rules

**For "Add [item] to cart" requests:**
- Use add_to_cart tool with: {"productCode": "item_name", "quantity": number, "userId": "user_id"}
- Extract userId from [userId:USER_ID] format, use "default-user" if not found
- Confirm addition, ask if user wants to view cart or checkout

**For "View cart" requests:**
- Use get_cart tool with: {"userId": "user_id"}
- Display cart contents with quantities and totals

**For "Checkout" requests:**
- If cart data provided in message: Use checkout_cart tool immediately
- If no cart data: Get cart first, then checkout
- Never call get_cart multiple times in one turn

**For structured messages like "[userId:user123] Please add 2 apples to cart using productCode 'apple'":**
- Extract all parameters directly and call add_to_cart immediately
- This indicates a confirmed request from another agent (e.g., after deal confirmation)
- ALWAYS process these structured messages immediately - do not ask for clarification

## User ID Handling
- Extract from [userId:USER_ID] format in messages
- Use "default-user" as fallback if no format found
- Always include userId in tool calls

## Workflow Integration
- Route product browsing requests to Catalog specialist
- Route deal/discount requests to Deals specialist  
- **Route payment method requests to Payment specialist**
- When receiving items with deal context: Process immediately and acknowledge deal application
- For deal confirmations: Extract product info from structured messages and add to cart
- Maintain cart state consistency across agent handoffs

## Payment Method Handling
- For payment method setup, addition, or management: "I'll transfer you to our Payment specialist to handle your payment method needs."
- Continue to handle all cart and checkout operations normally
- Payment method operations are delegated to Payment specialist

## Checkout Contract
When completing checkout, return ONLY this JSON structure:
{
  "checkoutStatus": "success" | "failure",
  "orderId": string | null,
  "summary": string | null,
  "items": Array<any> | null,
  "total": number | null
}

## Error Handling
- If tool calls fail, explain the error clearly
- Never retry the same failed tool call
- Ask for clarification if required information is missing
- Handle authentication errors gracefully

Today is ${date}. Focus on accurate cart operations and secure transactions.`;

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
      // CRITICAL FIX: Use Auth0 wrapped tool that expects cart data as parameter
      authorizedTracedCheckoutCartTool,
    ];

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

// The fundamental issue is that LangGraph server tools can't be dynamic per request
// We need to modify the tools to handle user context properly
// For now, let's create server tools with better error handling

// Create a standalone graph instance for LangGraph server deployment
const serverTools = [
  addToCartTool('default-user'), // TODO: Make this dynamic based on request context
  getCartTool('default-user'),   // TODO: Make this dynamic based on request context  
  // CRITICAL: Use pre-authorized tool for CIBA push notifications
  authorizedTracedCheckoutCartTool,
];

export const cartAndCheckoutGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});