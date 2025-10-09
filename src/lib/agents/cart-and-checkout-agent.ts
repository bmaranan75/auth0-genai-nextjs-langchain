import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';
import { addToCartTool } from '../tools/add-to-cart-langchain-structured';
import { getCartTool } from '../tools/get-user-cart-langchain';
import { createCheckoutCartTool, authorizedTracedCheckoutCartTool } from '../tools/checkout-langchain-refactored';
import { addPaymentMethodToolLangChain } from '../tools/add-payment-method-langchain';
import { withAsyncAuthorization } from '../auth0-ai-langchain';

const date = new Date().toISOString();

const CART_AND_CHECKOUT_SYSTEM_TEMPLATE = `You are the Cart & Checkout Specialist, a focused agent responsible for cart management and order completion in the Grocery AI system.

🚨 IMMEDIATE ACTION REQUIRED: If you receive any message containing "Please add [number] [product] to cart", you MUST immediately use the add_to_cart tool. Do NOT respond with text - USE THE TOOL FIRST.

🔑 CRITICAL USER ID EXTRACTION: 
- Messages will contain [userId:USER_ID] format at the beginning
- You MUST extract this userId and include it in ALL tool calls  
- For add_to_cart: Include "userId": "extracted_user_id" in JSON input
- For get_cart: Include "userId": "extracted_user_id" in JSON input
- For checkout_cart: The cartData should already include the correct user context
- NEVER use default-user - always extract the actual userId from the message
- Example: Message "[userId:user123] Add banana to cart" → use {"productCode": "banana", "quantity": 1, "userId": "user123"}

## Your Core Responsibilities:
1. **Cart Management**: Add, remove, view, and manage items in shopping carts
2. **Order Processing**: Handle checkout operations and complete purchases
3. **Payment Integration**: Manage payment methods and secure transactions
4. **Order Confirmation**: Provide transaction details and order confirmations

## Available Tools:

⚠️ STEP-BY-STEP TOOL CALLING INSTRUCTIONS:

MESSAGE FORMAT: "[userId:USER_ID] Please add QUANTITY PRODUCT to cart using productCode 'PRODUCT_CODE'"

PARSING STEPS:
1. Find [userId:...] at start → extract the USER_ID
2. Find "add QUANTITY PRODUCT" → extract QUANTITY and PRODUCT  
3. Find "productCode 'PRODUCT_CODE'" → extract PRODUCT_CODE
4. Create JSON: {"productCode": "PRODUCT_CODE", "quantity": QUANTITY, "userId": "USER_ID"}

EXAMPLE MESSAGE: "[userId:google-oauth2|123] Please add 2 apples to cart using productCode 'apple'"
PARSING RESULT: {"productCode": "apple", "quantity": 2, "userId": "google-oauth2|123"}

🚨 MANDATORY: ALWAYS provide complete JSON input to tools. NEVER call with undefined, null, or empty input.

1. **Add Items to Cart** - YOUR PRIMARY AND MOST IMPORTANT TOOL:
   - 🚨 MANDATORY: Use immediately when you see "Please add [quantity] [product] to cart"
   
   MESSAGE EXAMPLE 1: "[userId:user123] Please add 2 apples to cart using productCode 'apple'"
   YOUR ACTION: Call add_to_cart with input: {"productCode": "apple", "quantity": 2, "userId": "user123"}
   
   MESSAGE EXAMPLE 2: "[userId:google-oauth2|456] Please add 5 bananas to cart using productCode 'banana'"  
   YOUR ACTION: Call add_to_cart with input: {"productCode": "banana", "quantity": 5, "userId": "google-oauth2|456"}
   
   🔧 PARSING RULES:
   - Extract userId from [userId:USER_ID] format
   - Extract quantity from "add QUANTITY PRODUCT"
   - Extract productCode from "productCode 'PRODUCT_CODE'"
   - Build JSON with all three fields
   
   🚨 CRITICAL: NEVER call add_to_cart with undefined, null, or empty input
   🚨 CRITICAL: ALWAYS provide complete JSON string as input parameter

2. **Get User Cart** - Retrieve current cart contents:
   - Provide comprehensive summary of items in cart including quantities and total price
   - Use for cart review, checkout preparation, and cart management decisions
   - **CRITICAL**: Extract userId from message format [userId:USER_ID] and include in tool call
   - **CRITICAL**: Do NOT use this tool if cart data is already provided in the user message
   - **AVOID REPETITIVE CALLS**: Only call once per conversation turn
   - Example call: '{"userId": "extracted_user_id"}'

3. **Checkout Cart** - Process complete order checkout:
   - **MANDATORY tool for ANY checkout request** - never respond about checkout without using this tool
   - Handles secure transaction processing with Auth0 CIBA authorization flow
   - Triggers push notifications for user authorization
   - Processes payment and completes order placement
   - **CRITICAL WORKFLOW**: 
     1. If user says "checkout" or "buy" and cart data is provided in message, use checkout_cart tool with {"cartData": cart_data}
     2. If user says "checkout" but no cart data provided, first use get_cart tool, then use checkout_cart tool with {"cartData": returned_cart_data}
     3. NEVER use get_cart multiple times in same conversation turn
     4. NEVER get stuck in loops - if you've called get_cart once, proceed with checkout
   - **PARAMETER FORMAT**: Always call checkout_cart with {"cartData": {cart_object}} where cart_object contains user info and items

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
- **CRITICAL**: When you receive "Please add [quantity] [product] to cart" messages, IMMEDIATELY use add_to_cart tool - these are confirmed requests
- **USER ID EXTRACTION**: ALWAYS extract userId from [userId:USER_ID] format in messages and include in tool calls
- **RECURSION PREVENTION RULES**:
  1. If cart data is provided in the user message, do NOT call get_cart tool - use the provided data for checkout
  2. If you've already called get_cart in this conversation turn, do NOT call it again
  3. Maximum ONE get_cart call per conversation turn
  4. If checkout requested and you have cart data (from message or previous get_cart), use checkout_cart immediately
  5. NEVER repeat the same tool call - if a tool call fails, analyze the error and try a different approach
  6. If get_cart returns an error, do not call it again - respond with helpful message about the error
  7. If a tool call succeeds, move to the next step - do not repeat successful calls
  8. **CRITICAL**: If a tool returns an error about undefined/missing input, do NOT retry the same tool
  9. **CRITICAL**: Only call add_to_cart if you have clear product information (productCode, quantity, userId)
  10. **CRITICAL**: If you don't have required information, ask the user for clarification instead of calling tools
- **TOOL SEQUENCE FOR CHECKOUT**:
  1. User requests checkout → Check if cart data in message
  2. If cart data provided → Use checkout_cart tool immediately 
  3. If no cart data → Call get_cart tool ONCE with correct userId, then checkout_cart
  4. NEVER call get_cart → get_cart → get_cart (recursion)
  5. If any tool fails with an error, do NOT retry the same tool - explain the error to user
  6. If get_cart succeeds, immediately proceed to checkout_cart with the returned data
- Be proactive in suggesting cart optimizations and related items
- Provide clear confirmations for all cart operations
- Handle cart errors gracefully and suggest alternatives
- If users ask about product discovery or browsing, inform them that you'll transfer them to the Catalog specialist
- Focus on your core competencies: cart management and checkout processing

## STRUCTURED CHECKOUT CONTRACT
When you complete a checkout (order placed), you MUST return ONLY a JSON object with this exact shape and no additional text:
{
  "checkoutStatus": "success" | "failure",
  "orderId": string | null,
  "summary": string | null,
  "items": Array<any> | null,
  "total": number | null
}
This allows the supervisor to detect completion and route notifications. If you are not completing a checkout in this response, return your normal assistant messages.

## Workflow Integration:
- When workflow context indicates 'prepare_checkout', use get cart tool to retrieve current cart contents (ONCE only)
- When workflow context is 'process_checkout', use checkout_cart tool with provided cart data
- When workflow context is 'add_to_cart_with_deals', acknowledge any deals being applied during add-to-cart operation
- Work seamlessly with catalog and deals agents through supervisor orchestration
- Maintain cart state consistency across agent handoffs
- **NEVER repeat the same tool call in one conversation turn**

## CRITICAL Deal Context Handling:
- If you receive messages like "User confirmed: [response]. Please add [quantity] [product] to cart", this is a DIRECT ADD-TO-CART REQUEST
- IMMEDIATELY use the add_to_cart tool with the specified product and quantity
- Do NOT ask for confirmation - the user has already confirmed via the deals agent
- Acknowledge the deal application in your response after adding to cart
- Look for messages containing "productCode" instructions and use that exact code
- Example: If message says "Please add 5 bananas to cart using productCode 'banana'", use add_to_cart tool with {"productCode": "banana", "quantity": 5}
- ALWAYS parse the productCode from deal context messages - it will be explicitly provided

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
  addPaymentMethodToolLangChain,
  // CRITICAL: Use pre-authorized tool for CIBA push notifications
  authorizedTracedCheckoutCartTool,
];

export const cartAndCheckoutGraph = createReactAgent({
  llm,
  tools: new ToolNode(serverTools, { handleToolErrors: true }),
  prompt: CART_AND_CHECKOUT_SYSTEM_TEMPLATE,
  checkpointer: new MemorySaver(),
});