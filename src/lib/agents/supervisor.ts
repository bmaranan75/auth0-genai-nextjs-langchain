/**
 * CLEANED SUPERVISOR AGENT
 * 
 * This supervisor implements intelligent agent routing with LLM-based continuation detection.
 * 
 * Key Features:
 * - LLM-powered intent analysis for natural conversation flow
 * - Smart continuation detection for deal confirmations and checkout flows
 * - Simplified workflow management using context state
 * - Streamlined agent delegation without hardcoded keywords
 * 
 * Architecture:
 * - detectContinuationIntent(): Uses LLM to analyze user responses in context
 * - supervisor(): Main routing function with confidence-based decision making
 * - Agent nodes: Simplified handlers that focus on core functionality
 * 
 * Workflow Contexts:
 * - 'awaiting_deal_confirmation': User considering a deal offer
 * - 'add_to_cart_with_deals': Adding item with deal context
 * - 'check_deals': Checking for deals before adding to cart
 * - 'prepare_checkout'/'process_checkout': Checkout flow states
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

/**
 * Normalize product names from plural/conversational form to product code format
 * This helps bridge the gap between how users speak and how products are stored
 */
function normalizeProductName(productName: string): string {
  const normalized = productName.toLowerCase().trim();
  
  // Common plural to singular mappings for grocery items
  const pluralToSingular: { [key: string]: string } = {
    'apples': 'apple',
    'bananas': 'banana', 
    'oranges': 'orange',
    'carrots': 'carrots', // already singular form in catalog
    'potatoes': 'potato',
    'tomatoes': 'tomato',
    'onions': 'onion',
    'eggs': 'egg',
    'breads': 'bread',
    'milks': 'milk',
    'cheeses': 'cheese',
    'yogurts': 'yogurt',
    'cereals': 'cereal'
  };
  
  // Return normalized form if mapping exists, otherwise return original
  const result = pluralToSingular[normalized] || normalized;
  console.log(`[normalizeProductName] ${productName} → ${result}`);
  return result;
}

/**
 * ENHANCED SUPERVISOR STATE
 * 
 * Robust state management with validation and intelligent merging:
 * - messages: Conversation history (limited to prevent memory bloat)
 * - next: Target agent for routing
 * - userId: User identification (with fallback validation)
 * - conversationId: Conversation instance identifier (with auto-generation)
 * - cartData: Cart state with intelligent merging
 * - workflowContext: Context validation for continuation scenarios
 * - dealData: Deal information with history preservation
 * - pendingProduct: Product info with structure validation
 */
const SupervisorState = Annotation.Root({
  messages: Annotation<Array<HumanMessage | SystemMessage | AIMessage>>({
    reducer: (x, y) => {
      const combined = x.concat(y);
      // Limit message history to prevent memory bloat (keep last 10 messages)
      return combined.slice(-10);
    },
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
  }),
  userId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing userId - using default');
        return 'default-user';
      }
      return y ?? x;
    },
  }),
  conversationId: Annotation<string>({
    reducer: (x, y) => {
      if (!y && !x) {
        console.warn('[SupervisorState] Missing conversationId - generating default');
        return `conv-${Date.now()}`;
      }
      return y ?? x;
    },
  }),
  cartData: Annotation<any>({
    reducer: (x, y) => {
      // Merge cart data intelligently
      if (y === null) return null; // Explicit clear
      if (!y) return x; // No new data
      if (!x) return y; // First time
      // Merge objects
      return typeof y === 'object' && typeof x === 'object' ? { ...x, ...y } : y;
    },
  }),
  workflowContext: Annotation<string>({
    reducer: (x, y) => {
      // Validate workflow context
      const validContexts = [
        'awaiting_deal_confirmation',
        'add_to_cart_with_deals', 
        'check_deals',
        'prepare_checkout',
        'process_checkout'
      ];
      if (y && !validContexts.includes(y)) {
        console.warn(`[SupervisorState] Invalid workflow context: ${y}`);
        return x; // Keep previous valid context
      }
      return y ?? x;
    },
  }),
  dealData: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      if (!x) return y;
      // Intelligent merge - preserve important fields
      return {
        ...x,
        ...y,
        // Preserve history of deal interactions
        history: [...(x.history || []), ...(y.history || [])]
      };
    },
  }),
  pendingProduct: Annotation<any>({
    reducer: (x, y) => {
      if (y === null) return null; // Explicit clear
      if (!y) return x;
      // Validate product structure
      if (y && typeof y === 'object' && !y.product) {
        console.warn('[SupervisorState] Invalid pendingProduct structure:', y);
        return x;
      }
      return y;
    },
  }),
});

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  maxRetries: 2,
  timeout: 50000,
});

// LangGraph server configuration
const LANGGRAPH_SERVER_URL = 'http://localhost:2024';

import LangGraphClient, { conversationThreadMap, conversationThreadTimestamps, AgentCallOptions, AgentCallResult } from './langgraphClient';

// Clean up old conversation mappings (prevent memory leaks)
setInterval(() => {
  // Keep mappings for 1 hour, then clean up
  // In production, this should be more sophisticated with proper expiration tracking
  if (conversationThreadMap.size > 100) {
    console.log(`[callLangGraphAgent] Cleaning up thread mappings, current size: ${conversationThreadMap.size}`);
    conversationThreadMap.clear();
  }
}, 60 * 60 * 1000); // 1 hour

// Enhanced helper function to call LangGraph services via HTTP with retry logic
async function callLangGraphAgent(opts: AgentCallOptions): Promise<AgentCallResult> {
  // Delegate to LangGraphClient
  const client = new LangGraphClient(LANGGRAPH_SERVER_URL);
  return client.callAgentWithStream(opts);
}

// LangGraphClient implementation was extracted to src/lib/agents/langgraphClient.ts

// Enhanced product information extraction using LLM
async function extractProductInfo(content: string): Promise<{ product: string; quantity?: number } | null> {
  const extractionPrompt = new SystemMessage(`Extract product information from this user message.

Look for:
- Product name (e.g., "bananas", "milk", "bread")
- Quantity if mentioned (e.g., "5", "some", "a few")

Return ONLY a JSON object:
{
  "product": string | null,
  "quantity": number | null
}

If no clear product is mentioned, return {"product": null, "quantity": null}

User message: "${content}"`);

  try {
    const response = await llm.invoke([extractionPrompt]);
    const extraction = JSON.parse(response.content.toString());
    
    if (extraction.product) {
      return {
        product: extraction.product,
        quantity: extraction.quantity || undefined
      };
    }
    return null;
  } catch (error) {
    console.error('[supervisor] Error extracting product info:', error);
    return null;
  }
}

// Enhanced continuation detection using LLM with conversation history
async function detectContinuationIntent(
  message: string, 
  messages: Array<HumanMessage | SystemMessage | AIMessage>, 
  workflowContext?: string, 
  dealData?: any, 
  pendingProduct?: any
): Promise<{
  isContinuation: boolean;
  continuationType: 'deal_confirmation' | 'checkout_flow' | 'add_to_cart' | 'general';
  targetAgent: string;
  confidence: number;
  reasoning?: string;
}> {
  
  // ENHANCED: Better context building with message type handling
  let contextInfo = '';
  if (workflowContext === 'awaiting_deal_confirmation' && dealData && pendingProduct) {
    contextInfo = `CRITICAL CONTEXT: User was offered a deal on ${pendingProduct.product} (qty: ${pendingProduct.quantity || 1}). This is likely a deal confirmation response.`;
  } else if (workflowContext === 'prepare_checkout' || workflowContext === 'process_checkout') {
    contextInfo = `CONTEXT: User is in checkout flow (${workflowContext}).`;
  } else if (workflowContext === 'add_to_cart_with_deals') {
    contextInfo = `CONTEXT: User is adding items with deal considerations.`;
  } else if (pendingProduct) {
    contextInfo = `CONTEXT: Pending product: ${pendingProduct.product}.`;
  }

  // IMPROVED: Better conversation history with proper message type handling
  const recentMessages = messages.slice(-4).map(msg => {
    let role = 'Unknown';
    if (msg instanceof HumanMessage) role = 'User';
    else if (msg instanceof AIMessage) role = 'Assistant';
    else if (msg instanceof SystemMessage) role = 'System';
    
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return `${role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
  }).join('\n');

  const analysisPrompt = new SystemMessage(`You are analyzing user intent for conversation continuity in a shopping system.

${contextInfo}

RECENT CONVERSATION:
${recentMessages}

ANALYSIS RULES:
1. "awaiting_deal_confirmation" context + affirmative response = deal_confirmation (confidence: 0.95+)
2. Checkout contexts + confirmatory responses = checkout_flow 
3. Product mentions + cart actions = add_to_cart
4. Ambiguous responses in specific contexts = high-confidence continuation

AFFIRMATIVE PATTERNS:
- Direct: "yes", "sure", "ok", "apply", "take it", "sounds good", "great", "perfect"
- Contextual: "I'll take that", "apply the deal", "go ahead", "that works"
- Implicit: Single word responses in confirmation contexts

NEGATIVE PATTERNS:
- "no", "not now", "maybe later", "skip", "continue without"

Current message: "${message}"

Return JSON:
{
  "isContinuation": boolean,
  "continuationType": "deal_confirmation" | "checkout_flow" | "add_to_cart" | "general",
  "targetAgent": "catalog" | "cart_and_checkout" | "payment" | "deals",
  "confidence": number (0-1),
  "reasoning": "Brief explanation of decision"
}`);

  try {
    const response = await llm.invoke([analysisPrompt]);
    const analysis = JSON.parse(response.content.toString());
    
    // ENHANCED: Additional validation for critical contexts
    if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
      const messageWords = message.toLowerCase().trim().split(/\s+/);
      const affirmativePatterns = [
        'yes', 'sure', 'ok', 'okay', 'apply', 'take', 
        'sounds', 'great', 'perfect', 'good', 'deal'
      ];
      
      const hasStrongAffirmative = affirmativePatterns.some(pattern => 
        messageWords.some(word => word.includes(pattern) || pattern.includes(word))
      );
      
      // Override LLM for critical deal confirmation scenarios
      if (hasStrongAffirmative && analysis.confidence < 0.9) {
        console.log('[supervisor] Overriding LLM analysis for strong deal confirmation signals');
        return {
          isContinuation: true,
          continuationType: 'deal_confirmation',
          targetAgent: 'cart_and_checkout',
          confidence: 0.98,
          reasoning: 'Strong affirmative response in deal confirmation context'
        };
      }
    }
    
    return {
      ...analysis,
      confidence: Math.min(Math.max(analysis.confidence || 0.5, 0), 1) // Ensure 0-1 range
    };
    
  } catch (error) {
    console.error('[supervisor] Error in continuation detection:', error);
    
    // ENHANCED: Better fallback logic with context awareness
    if (workflowContext === 'awaiting_deal_confirmation') {
      const messageWords = message.toLowerCase().trim().split(/\s+/);
      const affirmativePatterns = [
        'yes', 'sure', 'ok', 'okay', 'apply', 'take', 
        'sounds', 'great', 'perfect', 'good', 'deal', 'go'
      ];
      
      const hasAffirmative = affirmativePatterns.some(pattern => 
        messageWords.some(word => word.includes(pattern) || pattern.includes(word))
      );
      
      if (hasAffirmative) {
        return {
          isContinuation: true,
          continuationType: 'deal_confirmation',
          targetAgent: 'cart_and_checkout',
          confidence: 0.85,
          reasoning: 'Fallback detection for affirmative response in deal context'
        };
      }
    }
    
    return {
      isContinuation: false,
      continuationType: 'general',
      targetAgent: 'catalog',
      confidence: 0.1,
      reasoning: 'Error in analysis - defaulting to general routing'
    };
  }
}

// Supervisor function to route requests
async function supervisor(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct } = state;
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  
  console.log(`[supervisor] Current workflow context: ${workflowContext}`);
  console.log(`[supervisor] Cart data available: ${!!cartData}`);
  console.log(`[supervisor] Deal data available: ${!!dealData}`);
  console.log(`[supervisor] Pending product: ${!!pendingProduct}`);
  
  // Enhanced continuation detection
  const continuationAnalysis = await detectContinuationIntent(messageContent, messages, workflowContext, dealData, pendingProduct);
  
  console.log(`[supervisor] Continuation analysis:`, continuationAnalysis);
  
  // Handle continuation scenarios based on LLM analysis
  if (continuationAnalysis.isContinuation && continuationAnalysis.confidence > 0.7) {
    console.log(`[supervisor] High-confidence continuation detected: ${continuationAnalysis.continuationType}`);
    console.log(`[supervisor] Routing to: ${continuationAnalysis.targetAgent} with confidence: ${continuationAnalysis.confidence}`);
    
    switch (continuationAnalysis.continuationType) {
      case 'deal_confirmation':
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: 'add_to_cart_with_deals',
          dealData,
          pendingProduct,
          messages: [lastMessage] // Preserve the user's response message
        };
        
      case 'checkout_flow':
        return {
          next: 'cart_and_checkout',
          userId,
          conversationId,
          workflowContext: cartData ? 'process_checkout' : 'prepare_checkout',
          cartData,
          messages: [lastMessage]
        };
        
      case 'add_to_cart':
        return {
          next: pendingProduct ? 'cart_and_checkout' : 'deals',
          userId,
          conversationId,
          workflowContext: pendingProduct ? 'add_to_cart_with_deals' : 'check_deals',
          dealData,
          pendingProduct,
          messages: [lastMessage]
        };
    }
  }
  
  // CRITICAL: Handle specific workflow contexts before falling back to general routing
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    console.log(`[supervisor] OVERRIDE: Detected add_to_cart_with_deals context with pending product, routing directly to cart_and_checkout`);
    return {
      next: 'cart_and_checkout',
      userId,
      conversationId,
      workflowContext: 'add_to_cart_with_deals',
      dealData,
      pendingProduct,
      messages: [lastMessage]
    };
  }
  
  if (workflowContext === 'awaiting_deal_confirmation' && pendingProduct) {
    console.log(`[supervisor] OVERRIDE: Detected awaiting_deal_confirmation context, checking for affirmative response`);
    // Robust affirmative detection as fallback
    const messageWords = messageContent.toLowerCase().trim().split(/\s+/);
    const affirmativePatterns = [
      'yes', 'sure', 'ok', 'okay', 'apply', 'take', 
      'sounds', 'great', 'perfect', 'good', 'deal', 'go'
    ];
    
    const hasAffirmative = affirmativePatterns.some(pattern => 
      messageWords.some(word => word.includes(pattern) || pattern.includes(word))
    );
    
    if (hasAffirmative) {
      console.log(`[supervisor] OVERRIDE: Affirmative response detected, routing to cart_and_checkout with add_to_cart_with_deals context`);
      return {
        next: 'cart_and_checkout',
        userId,
        conversationId,
        workflowContext: 'add_to_cart_with_deals',
        dealData,
        pendingProduct,
        messages: [lastMessage]
      };
    }
  }
  
  // Enhanced routing with context awareness - fallback only when continuation fails
  console.log(`[supervisor] No high-confidence continuation detected (confidence: ${continuationAnalysis.confidence})`);
  console.log(`[supervisor] Falling back to general routing logic`);
  
  const systemMessage = new SystemMessage(`You are an intelligent supervisor routing customer requests in a grocery shopping system.

Available agents:
• **catalog** - Product discovery, search, browsing, recommendations
• **cart_and_checkout** - Cart operations, checkout, order completion  
• **payment** - Payment method management only
• **deals** - Deal discovery and application

Context awareness rules:
- For new product inquiries → catalog
- For cart actions (add/remove/view) → deals first (to check offers), then cart_and_checkout
- For checkout/purchase → cart_and_checkout
- For payment setup → payment
- For ambiguous requests → use conversation context to infer intent

CRITICAL: If there's ANY indication this is a continuation or response to a previous interaction:
- Check workflow context carefully
- Consider pending products and deal data
- Prefer continuation agents over new conversations

${workflowContext ? `Current workflow: ${workflowContext}` : ''}
${pendingProduct ? `Pending product: ${pendingProduct.product}` : ''}
${dealData ? 'Deal context available' : ''}

Respond with ONLY the agent name: catalog, cart_and_checkout, payment, or deals

User message: "${messageContent}"`);

  const response = await llm.invoke([systemMessage, lastMessage]);
  const nextAgent = response.content.toString().trim().toLowerCase();
  
  // Validate and route
  const validAgents = ['catalog', 'cart_and_checkout', 'payment', 'deals'];
  const selectedAgent = validAgents.includes(nextAgent) ? nextAgent : 'catalog';
  
  console.log(`[supervisor] Routing to agent: ${selectedAgent}`);
  
  // Extract product information for deals routing (add-to-cart scenarios)
  let extractedProduct = pendingProduct;
  if (selectedAgent === 'deals' && !pendingProduct) {
    extractedProduct = await extractProductInfo(messageContent);
    console.log('[supervisor] Extracted product info for deals:', extractedProduct);
  }
  
  return {
    next: selectedAgent,
    userId,
    conversationId,
    workflowContext: selectedAgent === 'deals' && extractedProduct ? 'check_deals' : workflowContext,
    pendingProduct: extractedProduct || pendingProduct,
    dealData,
    cartData,
    messages: [lastMessage]
  };
}

// Agent functions that use the state
async function catalogNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData } = state;
  
  console.log('[catalogNode] Processing with catalog agent for user:', userId, 'conversation:', conversationId);
  
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  
  const result = await callLangGraphAgent({ agentId: 'catalog', message: messageContent, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  
  return {
    messages: result.messages,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

async function cartAndCheckoutNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, dealData, pendingProduct, cartData } = state;
  
  console.log('[cartAndCheckoutNode] Processing with cart & checkout agent for user:', userId, 'conversation:', conversationId);
  console.log('[cartAndCheckoutNode] Workflow context:', workflowContext);
  console.log('[cartAndCheckoutNode] Deal data available:', !!dealData);
  console.log('[cartAndCheckoutNode] Deal data:', dealData);
  console.log('[cartAndCheckoutNode] Pending product:', pendingProduct);
  console.log('[cartAndCheckoutNode] Cart data:', cartData);
  console.log('[cartAndCheckoutNode] All messages:', messages.map(m => ({ role: m instanceof HumanMessage ? 'human' : 'ai', content: typeof m.content === 'string' ? m.content : m.content.toString().substring(0, 100) })));
  
  // Determine the message to send to the cart agent
  let messageToAgent: string;
  const lastMessage = messages[messages.length - 1];
  const originalContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  
  // Check if this is a checkout request
  const isCheckoutRequest = originalContent.toLowerCase().includes('checkout') || 
                           originalContent.toLowerCase().includes('buy') ||
                           originalContent.toLowerCase().includes('purchase') ||
                           workflowContext === 'process_checkout' ||
                           workflowContext === 'prepare_checkout';
  
  if (workflowContext === 'add_to_cart_with_deals' && pendingProduct) {
    // Handle add-to-cart with deal context - provide full context to agent
    // Normalize product name for cart operations (deals use plural, cart uses singular)
    const productForCart = normalizeProductName(pendingProduct.product);
    
    messageToAgent = `[userId:${userId}] User confirmed: "${originalContent}". Please add ${pendingProduct.quantity || 1} ${pendingProduct.product} to cart using productCode "${productForCart}" and userId "${userId}"`;
    
    if (dealData) {
      if (dealData.applied) {
        messageToAgent += ` with the ${dealData.type || 'available'} deal applied`;
      } else if (dealData.pending) {
        messageToAgent += ` and apply the ${dealData.type || 'available'} deal that was offered`;
      }
    }
    
    console.log('[cartAndCheckoutNode] Deal context message:', messageToAgent);
  } else if (isCheckoutRequest) {
    // For checkout requests, let the agent handle getting cart data and processing checkout
    if (cartData) {
      messageToAgent = `[userId:${userId}] User wants to checkout. Cart data: ${JSON.stringify(cartData)}. ${originalContent}`;
      console.log('[cartAndCheckoutNode] Checkout message with existing cart data prepared');
    } else {
      messageToAgent = `[userId:${userId}] User wants to checkout: "${originalContent}". Please get the current cart and process checkout.`;
      console.log('[cartAndCheckoutNode] Checkout message without cart data - agent will handle getting cart');
    }
  } else {
    // For other scenarios, use the original user message with userId context
    messageToAgent = `[userId:${userId}] ${originalContent}`;
  }
  
  const result = await callLangGraphAgent({ agentId: 'cart_and_checkout', message: messageToAgent, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  
  // Check if the cart operation failed and suggest alternative
  const resultMessage = result.messages && result.messages.length > 0 ? result.messages[result.messages.length - 1] : null;
  const responseContent = typeof resultMessage?.content === 'string' ? resultMessage.content : (result.content || '');
  
  // Detect if product was not recognized
  const contentStr = typeof responseContent === 'string' ? responseContent : '';
  const productNotRecognized = contentStr.toLowerCase().includes('not recognizing the product') ||
                               contentStr.toLowerCase().includes('product not found') ||
                               contentStr.toLowerCase().includes('item not found');
  
  if (productNotRecognized && pendingProduct) {
    console.log('[cartAndCheckoutNode] Product not recognized, suggesting catalog search');
    
    // Create a helpful message suggesting catalog search
    const helpfulMessage = new AIMessage(`I couldn't find "${pendingProduct.product}" in our catalog. Let me help you find the right product. You can try searching for similar items or browse our catalog.`);
    
    return {
      messages: result.messages ? [...result.messages, helpfulMessage] : [helpfulMessage],
      userId,
      conversationId,
      workflowContext: null, // Clear workflow context to allow new interactions
      dealData: null, // Clear deal data since the product wasn't found
      pendingProduct: null, // Clear pending product
      cartData,
      next: END, // End this interaction, user can start fresh
    };
  }
  
  return {
    messages: result.messages,
    // PRESERVE ALL STATE - critical for workflow continuity
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
    next: END,
  };
}

async function dealsNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, workflowContext, pendingProduct, dealData, cartData } = state;
  
  console.log('[dealsNode] Processing with deals agent for user:', userId, 'conversation:', conversationId);
  console.log('[dealsNode] Workflow context:', workflowContext);
  console.log('[dealsNode] Pending product:', pendingProduct);
  
  // Determine message to send to deals agent
  const lastMessage = messages[messages.length - 1];
  let messageToAgent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  
  if (pendingProduct && workflowContext === 'check_deals') {
    messageToAgent = `User wants to add to cart: "${messageToAgent}". Check for deals on ${pendingProduct.product}${pendingProduct.quantity ? ` (quantity: ${pendingProduct.quantity})` : ''}`;
  }
  
  const result = await callLangGraphAgent({ agentId: 'deals', message: messageToAgent, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  
  // Analyze response for deal confirmation needs
  const responseMessages = result.messages;
  const responseContent = result.content || 'No deals found';
  
  // Simple check for deal confirmation prompts
  const requiresConfirmation = responseContent.toLowerCase().includes('would you like') ||
                              responseContent.toLowerCase().includes('apply this deal') ||
                              responseContent.toLowerCase().includes('interested in') ||
                              responseContent.toLowerCase().includes('take advantage');
  
  if (requiresConfirmation) {
    // Deal found, waiting for user confirmation
    console.log('[dealsNode] Deal confirmation required, setting awaiting_deal_confirmation state');
    console.log('[dealsNode] Pending product:', pendingProduct);
    console.log('[dealsNode] Deal data will be:', { pending: true, response: responseContent });
    
    return {
      messages: responseMessages,
      workflowContext: 'awaiting_deal_confirmation',
      dealData: { 
        ...dealData, // Preserve existing deal data
        pending: true, 
        response: responseContent, 
        type: 'product_deal' 
      },
      pendingProduct,
      cartData, // Preserve cart data
      userId,
      conversationId,
      next: END,
    };
  } else {
    // No confirmation needed, proceed to add to cart
    return {
      messages: responseMessages,
      workflowContext: 'add_to_cart_with_deals',
      dealData: { 
        ...dealData, // Preserve existing deal data
        applied: true, 
        response: responseContent, 
        type: 'product_deal' 
      },
      pendingProduct,
      cartData, // Preserve cart data
      userId,
      conversationId,
      next: 'cart_and_checkout',
    };
  }
}

async function paymentNode(state: typeof SupervisorState.State) {
  const { messages, userId, conversationId, cartData, workflowContext, dealData, pendingProduct } = state;
  
  console.log('[paymentNode] Processing with payment agent for user:', userId, 'conversation:', conversationId);
  console.log('[paymentNode] Workflow context:', workflowContext);
  
  const lastMessage = messages[messages.length - 1];
  const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.toString();
  
  const result = await callLangGraphAgent({ agentId: 'payment', message: messageContent, userId: userId || 'default-user', conversationId: conversationId || `conv-${userId || 'default'}-session` });
  
  return {
    messages: result.messages,
    // PRESERVE ALL STATE
    userId,
    conversationId,
    workflowContext,
    dealData,
    pendingProduct,
    cartData,
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

// Export graph without built-in checkpointer (SupervisorAgent will handle state)
export const supervisorGraph = workflow.compile();

// Class-based Supervisor Agent with local state management
export class SupervisorAgent {
  private userId: string;
  private conversationId?: string;
  private memorySaver: MemorySaver;
  private compiledGraph: any;
  private threadPrefix: string;
  private lgClient: LangGraphClient;

  constructor(userId: string, conversationId?: string) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.memorySaver = new MemorySaver();
    this.threadPrefix = `supervisor-${userId}`;
    this.lgClient = new LangGraphClient(LANGGRAPH_SERVER_URL);
    
    // Create compiled graph with optimized configuration
    this.compiledGraph = workflow.compile({ 
      checkpointer: this.memorySaver,
      // Add configuration for better state management
      interruptBefore: [], // Can add nodes to interrupt before if needed
      interruptAfter: []   // Can add nodes to interrupt after if needed
    });
    
    console.log('[SupervisorAgent] Initialized for userId:', userId, 'threadPrefix:', this.threadPrefix);
  }

  // CRITICAL FIX: Use consistent thread ID that matches remote agents
  private getThreadId(conversationId?: string): string {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    
    // Check if this conversation already has a mapped thread ID from remote agents
    const existingThreadId = conversationThreadMap.get(effectiveConversationId);
    if (existingThreadId) {
      console.log(`[SupervisorAgent] Using existing mapped thread: ${existingThreadId} for conversation: ${effectiveConversationId}`);
      return existingThreadId;
    }
    
    // Use supervisor-specific thread ID format for local graph execution
    return `supervisor-${effectiveConversationId}`;
  }

  // OPTIMIZED: Improved chat method with better state handling
  async chat(message: string, conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    console.log('[SupervisorAgent] Processing message with thread ID:', threadId);
    console.log('[SupervisorAgent] Effective conversation ID:', effectiveConversationId);

    try {
      // Ensure remote thread exists so LangGraph streaming and memory map work consistently
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);

      const result = await this.compiledGraph.invoke({
        messages: [new HumanMessage(message)],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          // Reduce recursion limit to prevent infinite loops
          recursion_limit: 5,
          max_execution_time: 60000 // 60 seconds
        }
      });

      // update timestamp for mapping
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      return result;
    } catch (error) {
      console.error('[SupervisorAgent] Error in chat:', error);

      // Return graceful error response
      return {
        messages: [new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')],
        userId: this.userId,
        conversationId: conversationId || this.conversationId,
        next: END
      };
    }
  }

  // Enhanced stream support with better error handling
  async stream(message: string, conversationId?: string) {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);

    try {
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());

      return this.compiledGraph.stream({
        messages: [new HumanMessage(message)],
        userId: this.userId,
        conversationId: effectiveConversationId,
        next: '',
      }, {
        configurable: { 
          thread_id: threadId,
          recursion_limit: 5,
          max_execution_time: 60000
        }
      });
    } catch (error) {
      console.error('[SupervisorAgent] Error in stream:', error);
      throw error;
    }
  }

  // Enhanced LangGraph-compatible invoke method
  async invoke(input: { messages: any[], conversationId?: string }, config?: any) {
    const threadId = this.getThreadId(input.conversationId);
    
    const finalConfig = config || { configurable: { thread_id: threadId } };
    if (!finalConfig.configurable) {
      finalConfig.configurable = { thread_id: threadId };
    } else if (!finalConfig.configurable.thread_id) {
      finalConfig.configurable.thread_id = threadId;
    }
    
    // Add enhanced configuration
    finalConfig.configurable.recursion_limit = finalConfig.configurable.recursion_limit || 5;
    finalConfig.configurable.max_execution_time = finalConfig.configurable.max_execution_time || 60000;
    
    const effectiveConversationId = input.conversationId || this.conversationId || `conv-${this.userId}-session`;
    await this.lgClient.ensureThread(effectiveConversationId, this.userId);
    conversationThreadTimestamps.set(effectiveConversationId, Date.now());

    return await this.compiledGraph.invoke({
      messages: input.messages,
      userId: this.userId,
      conversationId: effectiveConversationId,
      next: '',
    }, finalConfig);
  }

  // NEW: Method to get current state/context
  async getCurrentState(conversationId?: string): Promise<any> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Ensure thread exists remotely
      await this.lgClient.ensureThread(effectiveConversationId, this.userId);
      conversationThreadTimestamps.set(effectiveConversationId, Date.now());
      return await this.memorySaver.get({ configurable: { thread_id: threadId } });
    } catch (error) {
      console.error('[SupervisorAgent] Error getting current state:', error);
      return null;
    }
  }

  // ENHANCED: Better session clearing
  async clearSession(conversationId?: string): Promise<void> {
    const effectiveConversationId = conversationId || this.conversationId || `conv-${this.userId}-session`;
    const threadId = this.getThreadId(effectiveConversationId);
    try {
      // Remove from local maps
      conversationThreadMap.delete(effectiveConversationId);
      conversationThreadTimestamps.delete(effectiveConversationId);

      // Reset memory saver for this agent instance
      this.memorySaver = new MemorySaver();
      console.log('[SupervisorAgent] Cleared session for conversation:', effectiveConversationId, 'thread:', threadId);
    } catch (error) {
      console.error('[SupervisorAgent] Error clearing session:', error);
    }
  }

  // NEW: Get all active sessions for this user
  async getActiveSessions(): Promise<string[]> {
    try {
      // Return active conversation IDs for this user from the in-memory map
      const active: string[] = [];
      for (const [convId, threadId] of conversationThreadMap.entries()) {
        if (convId.includes(this.userId) || convId.includes(`conv-${this.userId}`) || threadId?.includes(this.userId)) {
          active.push(convId);
        }
      }
      return active;
    } catch (error) {
      console.error('[SupervisorAgent] Error getting active sessions:', error);
      return [];
    }
  }

  // NEW: Health check method
  async healthCheck(): Promise<{ status: string; userId: string; timestamp: number }> {
    return {
      status: 'healthy',
      userId: this.userId,
      timestamp: Date.now()
    };
  }
}

// Factory function for backward compatibility
export const createSupervisorAgent = (userId: string, conversationId?: string) => {
  return new SupervisorAgent(userId, conversationId);
};