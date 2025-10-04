import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createCatalogCartAgent } from './catalog-cart-agent';
import { createPaymentCheckoutAgent } from './payment-checkout-agent';
import { createDealsAgent } from './deals-agent';

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
    console.log('[supervisor] Checkout intent detected, routing to catalog_cart to prepare cart data');
    return {
      next: 'catalog_cart',
      userId,
      workflowContext: 'prepare_checkout',
      messages: []
    };
  }
  
  // If we have cart data and checkout context, proceed to payment
  if (cartData && workflowContext === 'prepare_checkout') {
    console.log('[supervisor] Cart data prepared, routing to payment_checkout');
    return {
      next: 'payment_checkout',
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
  
  // After deals check, route to catalog_cart for actual add-to-cart
  if (workflowContext === 'check_deals_complete') {
    console.log('[supervisor] Deals check complete, routing to catalog_cart for add-to-cart');
    return {
      next: 'catalog_cart',
      userId,
      workflowContext: 'add_to_cart_with_deals',
      dealData,
      pendingProduct,
      messages: []
    };
  }
  
  // Normal routing logic for other requests
  const systemMessage = new SystemMessage(`You are a supervisor that routes customer requests to specialized agents in a grocery shopping system.

You have three specialized agents available:
1. **catalog_cart** - Handles product discovery, searching, browsing catalog, adding items to cart, viewing cart contents
2. **payment_checkout** - Handles payment methods, checkout, purchase completion, order processing
3. **deals** - Identifies product-specific deals and helps customers apply savings opportunities

Analyze the user's request and determine which agent should handle it. Respond with ONLY the agent name.

Guidelines:
- Use "catalog_cart" for: product searches, browsing, "show me", "find", "what's in my cart", product questions, inventory checks
- Use "deals" for: checking deals, asking about discounts, when customers mention wanting to add items to cart (to check deals first)
- Use "payment_checkout" for: "checkout", "buy", "purchase", "complete order", "pay", "payment method", "credit card"
- If unclear, default to "catalog_cart" as it's the entry point for shopping

IMPORTANT: When customers want to add items to cart, the system should first check for deals via the deals agent, then proceed to catalog_cart.

Current user message: "${lastMessage.content}"`);

  const response = await llm.invoke([systemMessage, lastMessage]);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate the response
  const validAgents = ['catalog_cart', 'payment_checkout', 'deals'];
  const selectedAgent = validAgents.includes(nextAgent) ? nextAgent : 'catalog_cart';
  
  console.log(`[supervisor] Routing to agent: ${selectedAgent}`);
  
  return {
    next: selectedAgent,
    userId,
    messages: []
  };
}

// Agent functions that use the state
async function catalogCartNode(state: typeof SupervisorState.State) {
  const { messages, userId, workflowContext, dealData, pendingProduct } = state;
  
  console.log('[catalogCartNode] Processing with catalog/cart agent for user:', userId);
  console.log('[catalogCartNode] Workflow context:', workflowContext);
  console.log('[catalogCartNode] Deal data available:', !!dealData);
  console.log('[catalogCartNode] Pending product:', pendingProduct);
  
  // Special handling for prepare_checkout workflow
  if (workflowContext === 'prepare_checkout') {
    console.log('[catalogCartNode] Preparing cart data for checkout workflow');
    
    // Get cart data directly using the cart tool
    const { getCartTool } = require('../tools/get-user-cart-langchain');
    const cartTool = getCartTool(userId || 'default-user');
    
    try {
      const cartResult = await cartTool.func({});
      const cartData = JSON.parse(cartResult);
      
      if (cartData.success && cartData.cart) {
        console.log('[catalogCartNode] Cart data prepared successfully');
        return {
          messages: [new AIMessage('Cart prepared for checkout')],
          cartData: cartData.cart,
          workflowContext: 'prepare_checkout',
          next: 'supervisor', // Return to supervisor with cart data
        };
      } else {
        console.log('[catalogCartNode] Cart is empty or failed to retrieve');
        return {
          messages: [new AIMessage('Cart is empty. Please add items before checkout.')],
          next: END,
        };
      }
    } catch (error) {
      console.error('[catalogCartNode] Error preparing cart data:', error);
      return {
        messages: [new AIMessage('Error retrieving cart data. Please try again.')],
        next: END,
      };
    }
  }
  
  // Handle add-to-cart with deals workflow
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log('[catalogCartNode] Processing add-to-cart after deals check');
    
    // Create a message for adding the item to cart (deals already checked)
    let cartMessage = new HumanMessage(
      `Add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart${dealData ? ' (deals already checked)' : ''}`
    );
    
    const agent = createCatalogCartAgent(userId || 'default-user');
    
    const config = {
      configurable: {
        user_id: userId,
        deal_context: dealData,
        pending_product: pendingProduct
      }
    };
    
    const result = await agent.invoke({ messages: [cartMessage] }, config);
    
    return {
      messages: result.messages,
      next: END,
    };
  }
  
  // Normal catalog/cart operations
  const agent = createCatalogCartAgent(userId || 'default-user');
  
  // Pass proper configuration with user credentials
  const { getUser } = require('../auth0');
  let userObj = null;
  try {
    userObj = await getUser();
  } catch (e) {
    console.log('[catalogCartNode] Could not get user object, using userId only');
  }
  
  const config = {
    configurable: {
      user_id: userId,
      _credentials: {
        user: userObj || { sub: userId }
      }
    }
  };
  
  const result = await agent.invoke({ messages }, config);
  
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
  
  const agent = createDealsAgent(userId || 'default-user');
  
  // Create a message that includes the product information for deals checking
  let dealsMessage = messages[messages.length - 1];
  if (pendingProduct && workflowContext === 'check_deals') {
    dealsMessage = new HumanMessage(
      `Check for deals on ${pendingProduct.product}${pendingProduct.quantity ? ` (quantity: ${pendingProduct.quantity})` : ''}`
    );
  }
  
  const result = await agent.invoke({ messages: [dealsMessage] });
  
  // Parse the result to determine if deals were found and confirmed
  const lastResponse = result.messages[result.messages.length - 1];
  const responseContent = typeof lastResponse.content === 'string' ? 
    lastResponse.content : lastResponse.content.toString();
  
  // Check if this is a deal confirmation response
  const isDealConfirmation = responseContent.toLowerCase().includes('would you like') ||
                           responseContent.toLowerCase().includes('apply this deal') ||
                           responseContent.toLowerCase().includes('great news');
  
  if (isDealConfirmation) {
    // Deal found, waiting for user confirmation - stay in deals agent
    return {
      messages: result.messages,
      workflowContext: 'awaiting_deal_confirmation',
      next: END,
    };
  } else {
    // No deals found or deal processed, move to catalog_cart
    return {
      messages: result.messages,
      workflowContext: 'check_deals_complete',
      dealData: null, // Could extract deal info from response if needed
      next: 'supervisor',
    };
  }
}

async function paymentCheckoutNode(state: typeof SupervisorState.State) {
  const { messages, userId, cartData, workflowContext } = state;
  
  console.log('[paymentCheckoutNode] Processing with payment/checkout agent for user:', userId);
  console.log('[paymentCheckoutNode] Cart data available:', !!cartData);
  console.log('[paymentCheckoutNode] Workflow context:', workflowContext);
  
  // Pass proper configuration with user credentials for Auth0 CIBA
  // We need to get the full user object for proper CIBA authorization
  const { getUser } = require('../auth0');
  let userObj = null;
  try {
    userObj = await getUser();
  } catch (e) {
    console.log('[paymentCheckoutNode] Could not get user object, using userId only');
  }
  
  const config = {
    configurable: {
      user_id: userId,
      _credentials: {
        user: userObj || { sub: userId }
      },
      // Pass cart data through config for payment agent
      cart_data: cartData,
      workflow_context: workflowContext
    }
  };
  
  const agent = createPaymentCheckoutAgent(userId || 'default-user', cartData);
  const result = await agent.invoke({ messages }, config);
  
  return {
    messages: result.messages,
    next: END,
  };
}

// Build the graph
const workflow = new StateGraph(SupervisorState)
  .addNode('supervisor', supervisor)
  .addNode('catalog_cart', catalogCartNode)
  .addNode('payment_checkout', paymentCheckoutNode)
  .addNode('deals', dealsNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state) => state.next, {
    catalog_cart: 'catalog_cart',
    payment_checkout: 'payment_checkout',
    deals: 'deals',
  })
  .addConditionalEdges('catalog_cart', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addConditionalEdges('deals', (state) => state.next, {
    supervisor: 'supervisor',
    [END]: END,
  })
  .addEdge('payment_checkout', END);

export const supervisorGraph = workflow.compile();

// For backward compatibility with existing API
export const createSupervisorAgent = (userId: string) => {
  return {
    invoke: async (input: { messages: any[] }) => {
      const result = await supervisorGraph.invoke({
        messages: input.messages,
        userId,
        next: '',
      });
      return result;
    }
  };
};