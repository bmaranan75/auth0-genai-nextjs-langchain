import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createCatalogCartAgent } from './catalog-cart-agent';
import { createPaymentCheckoutAgent } from './payment-checkout-agent';

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

// Supervisor function to route requests
async function supervisor(state: typeof SupervisorState.State) {
  const { messages, userId, cartData, workflowContext } = state;
  const lastMessage = messages[messages.length - 1];
  
  console.log(`[supervisor] Current workflow context: ${workflowContext}`);
  console.log(`[supervisor] Cart data available: ${!!cartData}`);
  
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
  
  // Normal routing logic for other requests
  const systemMessage = new SystemMessage(`You are a supervisor that routes customer requests to specialized agents in a grocery shopping system.

You have two specialized agents available:
1. **catalog_cart** - Handles product discovery, searching, browsing catalog, adding items to cart, viewing cart contents
2. **payment_checkout** - Handles payment methods, checkout, purchase completion, order processing

Analyze the user's request and determine which agent should handle it. Respond with ONLY the agent name.

Guidelines:
- Use "catalog_cart" for: product searches, browsing, "show me", "find", "add to cart", "what's in my cart", product questions
- Use "payment_checkout" for: "checkout", "buy", "purchase", "complete order", "pay", "payment method", "credit card"
- If unclear, default to "catalog_cart" as it's the entry point for shopping

Current user message: "${lastMessage.content}"`);

  const response = await llm.invoke([systemMessage, lastMessage]);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate the response
  const validAgents = ['catalog_cart', 'payment_checkout'];
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
  const { messages, userId, workflowContext } = state;
  
  console.log('[catalogCartNode] Processing with catalog/cart agent for user:', userId);
  console.log('[catalogCartNode] Workflow context:', workflowContext);
  
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
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state) => state.next, {
    catalog_cart: 'catalog_cart',
    payment_checkout: 'payment_checkout',
  })
  .addConditionalEdges('catalog_cart', (state) => state.next, {
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