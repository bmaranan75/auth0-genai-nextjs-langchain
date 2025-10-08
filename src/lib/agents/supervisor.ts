import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { CatalogAgent } from './catalog-agent';
import { CartAndCheckoutAgent } from './cart-and-checkout-agent';
import { PaymentAgent } from './payment-agent';
import { DealsAgent } from './deals-agent';

// Define the state structure
const SupervisorState = Annotation.Root({
  messages: Annotation<Array<HumanMessage | SystemMessage>>({
    reducer: (x, y) => x.concat(y),
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
  }),
  userId: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  // Enhanced state for agent data passing
  cartData: Annotation<any>({
    reducer: (x, y) => y ?? x,
  }),
  workflowContext: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  // Deal-related state
  dealData: Annotation<any>({
    reducer: (x, y) => y ?? x,
  }),
  pendingProduct: Annotation<any>({
    reducer: (x, y) => y ?? x,
  }),
});

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

// Helper function to detect checkout intent
function isCheckoutIntent(content: string | any[]): boolean {
  const message = typeof content === 'string' ? content : content.toString();
  const checkoutKeywords = ['checkout', 'buy', 'purchase', 'complete order', 'pay now', 'proceed to payment'];
  return checkoutKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
}

// Helper function to detect add-to-cart intent with product mentions
function isAddToCartIntent(content: string | any[]): boolean {
  const message = typeof content === 'string' ? content : content.toString().toLowerCase();
  const addToCartKeywords = ['add to cart', 'add', 'i want', 'get me', 'put in cart', 'add some'];
  const hasAddIntent = addToCartKeywords.some(keyword => message.includes(keyword));
  
  // Also look for product mentions with quantities (e.g., "5 bananas", "2 apples")
  const hasProductWithQuantity = /\d+\s+\w+/.test(message) || 
                                /\b(some|few|several|many)\s+\w+/.test(message);
  
  return hasAddIntent || hasProductWithQuantity;
}

// Helper function to extract product information from user message
function extractProductInfo(content: string | any[]): { product: string; quantity?: number } | null {
  const message = typeof content === 'string' ? content : content.toString();
  
  // Try to match patterns like "5 bananas", "2 apples", "add 3 milk"
  const quantityProductMatch = message.match(/(\d+)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)*)/);
  if (quantityProductMatch) {
    return {
      product: quantityProductMatch[2].trim(),
      quantity: parseInt(quantityProductMatch[1])
    };
  }
  
  // Try to match product names after "add", "want", etc.
  const productKeywords = /(?:add|want|get|put)\s+(?:some\s+)?([a-zA-Z]+(?:\s+[a-zA-Z]+)*)/i;
  const productMatch = message.match(productKeywords);
  if (productMatch) {
    return {
      product: productMatch[1].trim()
    };
  }
  
  return null;
}

// Supervisor function to route requests
async function supervisor(state: typeof SupervisorState.State) {
  const { messages, userId, cartData, workflowContext, dealData, pendingProduct } = state;
  const lastMessage = messages[messages.length - 1];
  
  console.log(`[supervisor] Current workflow context: ${workflowContext}`);
  console.log(`[supervisor] Cart data available: ${!!cartData}`);
  console.log(`[supervisor] Deal data available: ${!!dealData}`);
  console.log(`[supervisor] Pending product: ${!!pendingProduct}`);
  
  // Multi-step checkout workflow handling
  if (isCheckoutIntent(lastMessage.content) && !cartData) {
    console.log('[supervisor] Checkout intent detected, routing to cart_and_checkout to prepare cart data');
    return {
      next: 'cart_and_checkout',
      userId,
      workflowContext: 'prepare_checkout',
      messages: []
    };
  }
  
  // If we have cart data and checkout context, proceed to cart_and_checkout for final processing
  if (cartData && workflowContext === 'prepare_checkout') {
    console.log('[supervisor] Cart data prepared, routing to cart_and_checkout for final checkout');
    return {
      next: 'cart_and_checkout',
      userId,
      workflowContext: 'process_checkout',
      cartData,
      messages: []
    };
  }

  // Deals workflow handling
  // Check for add-to-cart intent and route to deals agent first
  if (isAddToCartIntent(lastMessage.content) && workflowContext !== 'check_deals_complete') {
    const productInfo = extractProductInfo(lastMessage.content);
    if (productInfo) {
      console.log('[supervisor] Add-to-cart intent detected, routing to deals agent first');
      return {
        next: 'deals',
        userId,
        workflowContext: 'check_deals',
        pendingProduct: productInfo,
        messages: []
      };
    }
  }
  
  // After deals check, route to cart_and_checkout for actual add-to-cart
  if (workflowContext === 'check_deals_complete') {
    console.log('[supervisor] Deals check complete, routing to cart_and_checkout for add-to-cart');
    return {
      next: 'cart_and_checkout',
      userId,
      workflowContext: 'add_to_cart_with_deals',
      dealData,
      pendingProduct,
      messages: []
    };
  }
  
  // Normal routing logic for other requests
  const systemMessage = new SystemMessage(`You are a supervisor that routes customer requests to specialized agents in a grocery shopping system.

You have four specialized agents available:
1. **catalog** - Handles product discovery, searching, browsing catalog, product information and recommendations
2. **cart_and_checkout** - Handles cart management (add/remove items, view cart), checkout, and order completion
3. **payment** - Handles only payment method management and setup
4. **deals** - Identifies product-specific deals and helps customers apply savings opportunities

Analyze the user's request and determine which agent should handle it. Respond with ONLY the agent name.

Guidelines:
- Use "catalog" for: product searches, browsing, "show me products", "find items", product information, availability checks, recommendations
- Use "cart_and_checkout" for: "add to cart", "what's in my cart", "remove from cart", "checkout", "buy", "purchase", "complete order"
- Use "deals" for: checking deals, asking about discounts, when customers mention wanting to add items to cart (to check deals first)
- Use "payment" only for payment method management (adding cards, managing payment methods) - use cart_and_checkout for all checkout operations
- If unclear, default to "catalog" for discovery requests or "cart_and_checkout" for action requests

IMPORTANT: When customers want to add items to cart, the system should first check for deals via the deals agent, then proceed to cart_and_checkout.

Current user message: "${lastMessage.content}"`);

  const response = await llm.invoke([systemMessage, lastMessage]);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate the response
  const validAgents = ['catalog', 'cart_and_checkout', 'payment', 'deals'];
  const selectedAgent = validAgents.includes(nextAgent) ? nextAgent : 'catalog';
  
  console.log(`[supervisor] Routing to agent: ${selectedAgent}`);
  
  return {
    next: selectedAgent,
    userId,
    messages: []
  };
}

// Agent functions that use the state
async function catalogNode(state: typeof SupervisorState.State) {
  const { messages, userId } = state;
  
  console.log('[catalogNode] Processing with catalog agent for user:', userId);
  
  const agent = new CatalogAgent(userId || 'default-user');
  
  // Generate session ID for supervisor -> agent communication
  const sessionId = `supervisor-catalog-${userId}-${Date.now()}`;
  
  // Use the agent's chat method for proper memory management
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  const result = await agent.chat(messageContent, sessionId);
  
  return {
    messages: result.messages,
    next: END,
  };
}

async function cartAndCheckoutNode(state: typeof SupervisorState.State) {
  const { messages, userId, workflowContext, dealData, pendingProduct, cartData } = state;
  
  console.log('[cartAndCheckoutNode] Processing with cart & checkout agent for user:', userId);
  console.log('[cartAndCheckoutNode] Workflow context:', workflowContext);
  console.log('[cartAndCheckoutNode] Deal data available:', !!dealData);
  console.log('[cartAndCheckoutNode] Pending product:', pendingProduct);
  console.log('[cartAndCheckoutNode] Cart data available:', !!cartData);
  
  // Special handling for prepare_checkout workflow
  if (workflowContext === 'prepare_checkout' && !cartData) {
    console.log('[cartAndCheckoutNode] Preparing cart data for checkout workflow');
    
    // Delegate cart preparation to the cart-and-checkout agent
    const agent = new CartAndCheckoutAgent(userId || 'default-user');
    
    // Generate session ID for supervisor -> agent communication
    const sessionId = `supervisor-cart-prep-${userId}-${Date.now()}`;
    
    try {
      const result = await agent.chat('Please show me my current cart contents for checkout.', sessionId);
      
      // Parse the agent's response to extract cart data
      const responseMessages = result.messages || [new AIMessage(result.content || 'No response')];
      const lastResponse = responseMessages[responseMessages.length - 1];
      const responseContent = typeof lastResponse.content === 'string' ? 
        lastResponse.content : lastResponse.content.toString();
      
      // Check if cart has items based on agent response
      if (responseContent.toLowerCase().includes('empty') || 
          responseContent.toLowerCase().includes('no items')) {
        console.log('[cartAndCheckoutNode] Cart is empty according to agent');
        return {
          messages: [new AIMessage('Cart is empty. Please add items before checkout.')],
          next: END,
        };
      } else {
        console.log('[cartAndCheckoutNode] Cart data prepared successfully via agent');
        return {
          messages: responseMessages,
          cartData: { prepared: true, agentResponse: responseContent }, // Simplified cart data
          workflowContext: 'prepare_checkout',
          next: 'supervisor', // Return to supervisor with cart data
        };
      }
    } catch (error) {
      console.error('[cartAndCheckoutNode] Error preparing cart data via agent:', error);
      return {
        messages: [new AIMessage('Error retrieving cart data. Please try again.')],
        next: END,
      };
    }
  }
  
  // Handle add-to-cart with deals workflow
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log('[cartAndCheckoutNode] Processing add-to-cart after deals check');
    
    // Create a message for adding the item to cart (deals already checked)
    const cartMessage = `Add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart${dealData ? ' (deals already checked)' : ''}`;
    
    const agent = new CartAndCheckoutAgent(userId || 'default-user');
    
    // Generate session ID for supervisor -> agent communication
    const sessionId = `supervisor-cart-add-${userId}-${Date.now()}`;
    
    const result = await agent.chat(cartMessage, sessionId);
    
    return {
      messages: result.messages || [new AIMessage(result.content || 'Item added to cart')],
      next: END,
    };
  }
  
  // Handle checkout processing with cart data
  if (workflowContext === 'process_checkout' && cartData) {
    console.log('[cartAndCheckoutNode] Processing checkout with prepared cart data');
    
    const agent = new CartAndCheckoutAgent(userId || 'default-user', cartData);
    
    // Generate session ID for supervisor -> agent communication
    const sessionId = `supervisor-cart-checkout-${userId}-${Date.now()}`;
    
    const lastMessage = messages[messages.length - 1];
    const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
    const result = await agent.chat(messageContent, sessionId);
    
    return {
      messages: result.messages || [new AIMessage(result.content || 'Checkout processed')],
      next: END,
    };
  }
  
  // Normal cart and checkout operations
  const agent = new CartAndCheckoutAgent(userId || 'default-user', cartData);
  
  // Generate session ID for supervisor -> agent communication
  const sessionId = `supervisor-cart-${userId}-${Date.now()}`;
  
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  const result = await agent.chat(messageContent, sessionId);
  
  return {
    messages: result.messages,
    next: END,
  };
}

async function dealsNode(state: typeof SupervisorState.State) {
  const { messages, userId, workflowContext, pendingProduct } = state;
  
  console.log('[dealsNode] Processing with deals agent for user:', userId);
  console.log('[dealsNode] Workflow context:', workflowContext);
  console.log('[dealsNode] Pending product:', pendingProduct);
  
  const agent = new DealsAgent(userId || 'default-user');
  
  // Create a message that includes the product information for deals checking
  const lastMessage = messages[messages.length - 1];
  let dealsMessage = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  if (pendingProduct && workflowContext === 'check_deals') {
    dealsMessage = `Check for deals on ${pendingProduct.product}${pendingProduct.quantity ? ` (quantity: ${pendingProduct.quantity})` : ''}`;
  }
  
  // Generate session ID for supervisor -> agent communication
  const sessionId = `supervisor-deals-${userId}-${Date.now()}`;
  
  const result = await agent.chat(dealsMessage, sessionId);
  
  // Parse the result to determine if deals were found and confirmed
  const responseMessages = result.messages || [new AIMessage(result.content || 'No deals found')];
  const lastResponse = responseMessages[responseMessages.length - 1];
  const responseContent = typeof lastResponse.content === 'string' ? 
    lastResponse.content : lastResponse.content.toString();
  
  // Check if this is a deal confirmation response
  const isDealConfirmation = responseContent.toLowerCase().includes('would you like') ||
                           responseContent.toLowerCase().includes('apply this deal') ||
                           responseContent.toLowerCase().includes('great news');
  
  if (isDealConfirmation) {
    // Deal found, waiting for user confirmation - stay in deals agent
    return {
      messages: responseMessages,
      workflowContext: 'awaiting_deal_confirmation',
      next: END,
    };
  } else {
    // No deals found or deal processed, move to catalog_cart
    return {
      messages: responseMessages,
      workflowContext: 'check_deals_complete',
      dealData: null, // Could extract deal info from response if needed
      next: 'supervisor',
    };
  }
}

async function paymentNode(state: typeof SupervisorState.State) {
  const { messages, userId, cartData, workflowContext } = state;
  
  console.log('[paymentNode] Processing with payment agent for user:', userId);
  console.log('[paymentNode] Workflow context:', workflowContext);
  
  const agent = new PaymentAgent(userId || 'default-user');
  
  // Generate session ID for supervisor -> agent communication
  const sessionId = `supervisor-payment-${userId}-${Date.now()}`;
  
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  const result = await agent.chat(messageContent, sessionId);
  
  return {
    messages: result.messages,
    next: END,
  };
}

// Build the graph
const workflow = new StateGraph(SupervisorState)
  .addNode('supervisor', supervisor)
  .addNode('catalog', catalogNode)
  .addNode('cart_and_checkout', cartAndCheckoutNode)
  .addNode('payment', paymentNode)
  .addNode('deals', dealsNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state) => state.next, {
    catalog: 'catalog',
    cart_and_checkout: 'cart_and_checkout',
    payment: 'payment',
    deals: 'deals',
  })
  .addConditionalEdges('catalog', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('cart_and_checkout', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('deals', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addEdge('payment', END);

export const supervisorGraph = workflow.compile();

// Class-based Supervisor Agent to match the design pattern
export class SupervisorAgent {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    console.log('[SupervisorAgent] Creating supervisor for userId:', userId);
  }

  // Standalone usage - can be called by any system
  async chat(message: string, sessionId?: string): Promise<any> {
    const threadId = sessionId || `supervisor-${this.userId}-default`;
    
    const result = await supervisorGraph.invoke({
      messages: [new HumanMessage(message)],
      userId: this.userId,
      next: '',
    });
    
    return result;
  }

  // Stream support for real-time responses
  async stream(message: string, sessionId?: string) {
    const threadId = sessionId || `supervisor-${this.userId}-default`;
    
    return supervisorGraph.stream({
      messages: [new HumanMessage(message)],
      userId: this.userId,
      next: '',
    });
  }

  // LangGraph-compatible invoke method
  async invoke(input: { messages: any[] }, config?: any) {
    return await supervisorGraph.invoke({
      messages: input.messages,
      userId: this.userId,
      next: '',
    });
  }

  // Get conversation history (supervisor manages state across multiple agents)
  async getHistory(sessionId?: string) {
    // Supervisor doesn't maintain its own memory, delegates to specialized agents
    console.log(`[SupervisorAgent] History managed by individual specialized agents`);
    return null;
  }

  // Clear session memory across all agents
  async clearSession(sessionId?: string) {
    console.log(`[SupervisorAgent] Session clearing delegated to individual agents`);
    // In a full implementation, this could clear sessions across all agents
  }
}

// Factory function for backward compatibility
export const createSupervisorAgent = (userId: string) => {
  return new SupervisorAgent(userId);
};